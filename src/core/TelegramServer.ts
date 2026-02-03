import type {
  Chat,
  Message,
  Update,
  User,
  UserFromGetMe,
  CallbackQuery,
  InlineQuery,
  InlineQueryResult,
  Poll,
  PollOption,
  ChatMember,
  ChatPermissions,
  ChatInviteLink,
  ChatAdministratorRights,
  ForumTopic,
  MessageEntity,
  ReactionType,
  PhotoSize,
  Document,
  Audio,
  Video,
  Voice,
  VideoNote,
  Sticker,
  File,
} from "grammy/types";
import { ChatState, type StoredInviteLink } from "./ChatState.js";
import { MemberState } from "./MemberState.js";
import { PollState, type StoredPoll } from "./PollState.js";
import { FileState } from "./FileState.js";
import { UpdateFactory } from "./UpdateFactory.js";
import { parseFormattedText, type ParseMode } from "./MarkdownParser.js";
import { BotResponse, type TelegramError } from "./BotResponse.js";

/**
 * Pending callback query tracking.
 */
interface PendingCallbackQuery {
  id: string;
  answered: boolean;
  answerText?: string;
  answerAlert?: boolean;
  answerUrl?: string;
  answerCacheTime?: number;
}

/**
 * Pending inline query tracking.
 */
interface PendingInlineQuery {
  id: string;
  answered: boolean;
  results?: InlineQueryResult[];
  cacheTime?: number;
  isPersonal?: boolean;
  nextOffset?: string;
  switchPmText?: string;
  switchPmParameter?: string;
}

/**
 * Message reaction tracking.
 */
interface MessageReaction {
  messageId: number;
  chatId: number;
  reactions: Map<number, ReactionType[]>; // userId -> reactions
}

/**
 * Simulates a Telegram server.
 *
 * Maintains state for chats, messages, users, and handles API method calls
 * returning responses that match what Telegram would return.
 */
export class TelegramServer {
  // State managers
  readonly chatState: ChatState;
  readonly memberState: MemberState;
  readonly pollState: PollState;
  readonly fileState: FileState;
  readonly updateFactory: UpdateFactory;

  // Bot info
  private botInfo: UserFromGetMe;

  // ID counters
  private updateIdCounter = 1;
  private messageIdCounter = 1;
  private callbackQueryIdCounter = 1;
  private inlineQueryIdCounter = 1;

  // Tracking
  private pendingCallbackQueries = new Map<string, PendingCallbackQuery>();
  private pendingInlineQueries = new Map<string, PendingInlineQuery>();
  private messageReactions = new Map<string, MessageReaction>(); // `${chatId}:${messageId}`

  // Bot commands and menu buttons
  private botCommands: Array<{ command: string; description: string }> = [];
  private chatMenuButtons = new Map<number, { type: string }>();
  private defaultMenuButton: { type: string } = { type: "default" };

  // Current response being built (for tracking API calls)
  private currentResponse: BotResponse | null = null;

  constructor(botInfo: UserFromGetMe) {
    this.botInfo = botInfo;
    this.chatState = new ChatState();
    this.memberState = new MemberState();
    this.pollState = new PollState();
    this.fileState = new FileState();
    this.updateFactory = new UpdateFactory();
  }

  // === Bot Info ===

  getBotInfo(): UserFromGetMe {
    return this.botInfo;
  }

  setBotInfo(botInfo: UserFromGetMe): void {
    this.botInfo = botInfo;
  }

  // === Bot Permission Checks ===

  /**
   * Check if a chat is a private chat (DM).
   */
  private isPrivateChat(chatId: number): boolean {
    const chatData = this.chatState.get(chatId);
    return chatData?.chat.type === "private";
  }

  /**
   * Check if the bot has a specific admin permission in a chat.
   * Returns true if the bot is creator, or is an admin with the required permission.
   * Returns false if the bot is not an admin or doesn't have the permission.
   * Note: Always returns true for private chats where admin permissions don't apply.
   */
  private checkBotPermission(
    chatId: number,
    permission: keyof ChatAdministratorRights
  ): boolean {
    // Private chats don't have admin permissions
    if (this.isPrivateChat(chatId)) {
      return true;
    }

    const botMember = this.memberState.getMember(chatId, this.botInfo.id);
    if (!botMember) return false;

    // Creator has all permissions
    if (botMember.status === "creator") return true;

    // Must be an admin with the specific permission
    if (botMember.status === "administrator" && botMember.adminRights) {
      return botMember.adminRights[permission] === true;
    }

    return false;
  }

  /**
   * Ensure the bot has a specific admin permission, throwing an error if not.
   * Skips the check for private chats where admin permissions don't apply.
   */
  private requireBotPermission(
    chatId: number,
    permission: keyof ChatAdministratorRights,
    action: string
  ): void {
    if (!this.checkBotPermission(chatId, permission)) {
      throw this.createApiError(
        400,
        `Bad Request: not enough rights to ${action}`
      );
    }
  }

  // === Response Tracking ===

  /**
   * Set the current response being built.
   */
  setCurrentResponse(response: BotResponse | null): void {
    this.currentResponse = response;
  }

  /**
   * Get the current response being built.
   */
  getCurrentResponse(): BotResponse | null {
    return this.currentResponse;
  }

  // === Time Simulation ===

  /**
   * Advance simulated time by seconds.
   */
  advanceTime(seconds: number): void {
    this.memberState.advanceTime(seconds);
    this.pollState.advanceTime(seconds);
  }

  /**
   * Set simulated current time.
   */
  setCurrentTime(time: number): void {
    this.memberState.setCurrentTime(time);
    this.pollState.setCurrentTime(time);
  }

  /**
   * Get current timestamp.
   */
  private timestamp(): number {
    return Math.floor(this.memberState.getCurrentTime() / 1000);
  }

  // === API Handler ===

  /**
   * Handle incoming API calls from the bot.
   */
  async handleApiCall(
    method: string,
    payload: Record<string, unknown>
  ): Promise<unknown> {
    const handler = this.apiHandlers[method];
    if (!handler) {
      // For unhandled methods, return a generic success
      console.warn(`[grammy-test] Unhandled API method: ${method}`);
      return true;
    }
    return handler(payload);
  }

  // === Update Simulation ===

  /**
   * Simulate a user sending a message.
   */
  simulateUserMessage(
    user: User,
    chat: Chat,
    text: string,
    options: {
      parseMode?: ParseMode;
      replyToMessageId?: number;
      messageThreadId?: number;
    } = {}
  ): Update {
    this.ensureChat(chat);
    this.ensureChatMember(chat.id, user);

    let finalText = text;
    let entities: MessageEntity[] | undefined;

    if (options.parseMode) {
      const parsed = parseFormattedText(text, options.parseMode);
      finalText = parsed.text;
      entities = parsed.entities.length > 0 ? parsed.entities : undefined;
    }

    const message = this.cleanObject({
      message_id: this.messageIdCounter++,
      date: this.timestamp(),
      chat,
      from: user,
      text: finalText,
      entities,
      reply_to_message: options.replyToMessageId
        ? this.chatState.getMessage(chat.id, options.replyToMessageId)
        : undefined,
      message_thread_id: options.messageThreadId,
    }) as unknown as Message.TextMessage;

    this.chatState.storeMessage(chat.id, message);

    return {
      update_id: this.updateIdCounter++,
      message,
    } as Update;
  }

  /**
   * Simulate a user sending a command.
   */
  simulateUserCommand(
    user: User,
    chat: Chat,
    command: string,
    args?: string,
    options: {
      replyToMessageId?: number;
      messageThreadId?: number;
    } = {}
  ): Update {
    this.ensureChat(chat);
    this.ensureChatMember(chat.id, user);

    const text = args ? `${command} ${args}` : command;
    const entities: MessageEntity[] = [
      {
        type: "bot_command",
        offset: 0,
        length: command.length,
      },
    ];

    const message = this.cleanObject({
      message_id: this.messageIdCounter++,
      date: this.timestamp(),
      chat,
      from: user,
      text,
      entities,
      reply_to_message: options.replyToMessageId
        ? this.chatState.getMessage(chat.id, options.replyToMessageId)
        : undefined,
      message_thread_id: options.messageThreadId,
    }) as unknown as Message.TextMessage;

    this.chatState.storeMessage(chat.id, message);

    return {
      update_id: this.updateIdCounter++,
      message,
    } as Update;
  }

  /**
   * Simulate a user clicking an inline keyboard button.
   */
  simulateCallbackQuery(
    user: User,
    chat: Chat,
    data: string,
    fromMessage?: Message
  ): Update {
    const queryId = String(this.callbackQueryIdCounter++);

    this.pendingCallbackQueries.set(queryId, {
      id: queryId,
      answered: false,
    });

    // If no message provided, create a minimal message with the chat info
    // This allows ctx.reply() to work in callback query handlers
    const message = fromMessage ?? {
      message_id: this.messageIdCounter++,
      date: this.timestamp(),
      chat,
      from: this.botInfo,
      text: "[Button clicked]",
    } as Message.TextMessage;

    const callbackQuery = this.cleanObject({
      id: queryId,
      from: user,
      chat_instance: String(chat.id),
      data,
      message,
    }) as CallbackQuery;

    return {
      update_id: this.updateIdCounter++,
      callback_query: callbackQuery,
    } as Update;
  }

  /**
   * Simulate an inline query.
   */
  simulateInlineQuery(
    user: User,
    query: string,
    options: {
      offset?: string;
      chatType?: "sender" | "private" | "group" | "supergroup" | "channel";
    } = {}
  ): Update {
    const queryId = String(this.inlineQueryIdCounter++);

    this.pendingInlineQueries.set(queryId, {
      id: queryId,
      answered: false,
    });

    const inlineQuery: InlineQuery = this.cleanObject({
      id: queryId,
      from: user,
      query,
      offset: options.offset ?? "",
      chat_type: options.chatType,
    });

    return {
      update_id: this.updateIdCounter++,
      inline_query: inlineQuery,
    } as Update;
  }

  /**
   * Simulate a poll answer.
   */
  simulatePollAnswer(
    user: User,
    pollId: string,
    optionIds: number[]
  ): Update {
    // Update poll state
    this.pollState.vote(pollId, user.id, optionIds);

    return {
      update_id: this.updateIdCounter++,
      poll_answer: {
        poll_id: pollId,
        user,
        option_ids: optionIds,
      },
    } as Update;
  }

  /**
   * Simulate a message reaction.
   */
  simulateMessageReaction(
    user: User,
    chat: Chat,
    messageId: number,
    newReactions: ReactionType[]
  ): Update {
    const key = `${chat.id}:${messageId}`;
    let reaction = this.messageReactions.get(key);

    if (!reaction) {
      reaction = {
        messageId,
        chatId: chat.id,
        reactions: new Map(),
      };
      this.messageReactions.set(key, reaction);
    }

    const oldReactions = reaction.reactions.get(user.id) ?? [];
    reaction.reactions.set(user.id, newReactions);

    return {
      update_id: this.updateIdCounter++,
      message_reaction: {
        chat,
        message_id: messageId,
        user,
        date: this.timestamp(),
        old_reaction: oldReactions,
        new_reaction: newReactions,
      },
    } as Update;
  }

  /**
   * Simulate a user sending a photo.
   */
  simulatePhotoMessage(
    user: User,
    chat: Chat,
    width: number,
    height: number,
    options: {
      content?: Buffer | Uint8Array;
      fileSize?: number;
      caption?: string;
      parseMode?: ParseMode;
      replyToMessageId?: number;
    } = {}
  ): Update {
    this.ensureChat(chat);
    this.ensureChatMember(chat.id, user);

    const photos = this.fileState.storePhoto(width, height, {
      content: options.content,
      fileSize: options.fileSize,
    });

    let caption = options.caption;
    let captionEntities: MessageEntity[] | undefined;

    if (options.parseMode && caption) {
      const parsed = parseFormattedText(caption, options.parseMode);
      caption = parsed.text;
      captionEntities = parsed.entities.length > 0 ? parsed.entities : undefined;
    }

    const message = this.cleanObject({
      message_id: this.messageIdCounter++,
      date: this.timestamp(),
      chat,
      from: user,
      photo: photos,
      caption,
      caption_entities: captionEntities,
      reply_to_message: options.replyToMessageId
        ? this.chatState.getMessage(chat.id, options.replyToMessageId)
        : undefined,
    }) as unknown as Message.PhotoMessage;

    this.chatState.storeMessage(chat.id, message);

    return {
      update_id: this.updateIdCounter++,
      message,
    } as Update;
  }

  /**
   * Simulate a user sending a document.
   */
  simulateDocumentMessage(
    user: User,
    chat: Chat,
    fileName: string,
    mimeType: string,
    options: {
      content?: Buffer | Uint8Array;
      fileSize?: number;
      caption?: string;
      parseMode?: ParseMode;
      replyToMessageId?: number;
    } = {}
  ): Update {
    this.ensureChat(chat);
    this.ensureChatMember(chat.id, user);

    const document = this.fileState.storeDocument(fileName, mimeType, {
      content: options.content,
      fileSize: options.fileSize,
    });

    let caption = options.caption;
    let captionEntities: MessageEntity[] | undefined;

    if (options.parseMode && caption) {
      const parsed = parseFormattedText(caption, options.parseMode);
      caption = parsed.text;
      captionEntities = parsed.entities.length > 0 ? parsed.entities : undefined;
    }

    const message = this.cleanObject({
      message_id: this.messageIdCounter++,
      date: this.timestamp(),
      chat,
      from: user,
      document,
      caption,
      caption_entities: captionEntities,
      reply_to_message: options.replyToMessageId
        ? this.chatState.getMessage(chat.id, options.replyToMessageId)
        : undefined,
    }) as unknown as Message.DocumentMessage;

    this.chatState.storeMessage(chat.id, message);

    return {
      update_id: this.updateIdCounter++,
      message,
    } as Update;
  }

  /**
   * Simulate user sending audio.
   */
  simulateAudioMessage(
    user: User,
    chat: Chat,
    duration: number,
    options: {
      title?: string;
      performer?: string;
      caption?: string;
      replyToMessageId?: number;
    } = {}
  ): Update {
    this.ensureChat(chat);
    this.ensureChatMember(chat.id, user);

    const fileId = this.fileState.generateFileId("audio");
    const fileUniqueId = this.fileState.generateFileUniqueId();

    const audio: Audio = {
      file_id: fileId,
      file_unique_id: fileUniqueId,
      duration,
      title: options.title,
      performer: options.performer,
    };

    const message = this.cleanObject({
      message_id: this.messageIdCounter++,
      date: this.timestamp(),
      chat,
      from: user,
      audio,
      caption: options.caption,
      reply_to_message: options.replyToMessageId
        ? this.chatState.getMessage(chat.id, options.replyToMessageId)
        : undefined,
    }) as unknown as Message.AudioMessage;

    this.chatState.storeMessage(chat.id, message);

    return {
      update_id: this.updateIdCounter++,
      message,
    } as Update;
  }

  /**
   * Simulate user sending video.
   */
  simulateVideoMessage(
    user: User,
    chat: Chat,
    width: number,
    height: number,
    duration: number,
    options: {
      caption?: string;
      replyToMessageId?: number;
    } = {}
  ): Update {
    this.ensureChat(chat);
    this.ensureChatMember(chat.id, user);

    const fileId = this.fileState.generateFileId("video");
    const fileUniqueId = this.fileState.generateFileUniqueId();

    const video: Video = {
      file_id: fileId,
      file_unique_id: fileUniqueId,
      width,
      height,
      duration,
    };

    const message = this.cleanObject({
      message_id: this.messageIdCounter++,
      date: this.timestamp(),
      chat,
      from: user,
      video,
      caption: options.caption,
      reply_to_message: options.replyToMessageId
        ? this.chatState.getMessage(chat.id, options.replyToMessageId)
        : undefined,
    }) as unknown as Message.VideoMessage;

    this.chatState.storeMessage(chat.id, message);

    return {
      update_id: this.updateIdCounter++,
      message,
    } as Update;
  }

  /**
   * Simulate user sending voice message.
   */
  simulateVoiceMessage(
    user: User,
    chat: Chat,
    duration: number,
    options: {
      caption?: string;
      replyToMessageId?: number;
    } = {}
  ): Update {
    this.ensureChat(chat);
    this.ensureChatMember(chat.id, user);

    const fileId = this.fileState.generateFileId("voice");
    const fileUniqueId = this.fileState.generateFileUniqueId();

    const voice: Voice = {
      file_id: fileId,
      file_unique_id: fileUniqueId,
      duration,
    };

    const message = this.cleanObject({
      message_id: this.messageIdCounter++,
      date: this.timestamp(),
      chat,
      from: user,
      voice,
      caption: options.caption,
      reply_to_message: options.replyToMessageId
        ? this.chatState.getMessage(chat.id, options.replyToMessageId)
        : undefined,
    }) as unknown as Message.VoiceMessage;

    this.chatState.storeMessage(chat.id, message);

    return {
      update_id: this.updateIdCounter++,
      message,
    } as Update;
  }

  /**
   * Simulate user sending sticker.
   */
  simulateStickerMessage(
    user: User,
    chat: Chat,
    options: {
      emoji?: string;
      setName?: string;
    } = {}
  ): Update {
    this.ensureChat(chat);
    this.ensureChatMember(chat.id, user);

    const fileId = this.fileState.generateFileId("sticker");
    const fileUniqueId = this.fileState.generateFileUniqueId();

    const sticker: Sticker = {
      file_id: fileId,
      file_unique_id: fileUniqueId,
      type: "regular",
      width: 512,
      height: 512,
      is_animated: false,
      is_video: false,
      emoji: options.emoji,
      set_name: options.setName,
    };

    const message = this.cleanObject({
      message_id: this.messageIdCounter++,
      date: this.timestamp(),
      chat,
      from: user,
      sticker,
    }) as unknown as Message.StickerMessage;

    this.chatState.storeMessage(chat.id, message);

    return {
      update_id: this.updateIdCounter++,
      message,
    } as Update;
  }

  /**
   * Simulate user sending contact.
   */
  simulateContactMessage(
    user: User,
    chat: Chat,
    options: {
      phoneNumber: string;
      firstName: string;
      lastName?: string;
    }
  ): Update {
    this.ensureChat(chat);
    this.ensureChatMember(chat.id, user);

    const message = this.cleanObject({
      message_id: this.messageIdCounter++,
      date: this.timestamp(),
      chat,
      from: user,
      contact: {
        phone_number: options.phoneNumber,
        first_name: options.firstName,
        last_name: options.lastName,
      },
    }) as unknown as Message.ContactMessage;

    this.chatState.storeMessage(chat.id, message);

    return {
      update_id: this.updateIdCounter++,
      message,
    } as Update;
  }

  /**
   * Simulate user sending location.
   */
  simulateLocationMessage(
    user: User,
    chat: Chat,
    latitude: number,
    longitude: number
  ): Update {
    this.ensureChat(chat);
    this.ensureChatMember(chat.id, user);

    const message = this.cleanObject({
      message_id: this.messageIdCounter++,
      date: this.timestamp(),
      chat,
      from: user,
      location: {
        latitude,
        longitude,
      },
    }) as unknown as Message.LocationMessage;

    this.chatState.storeMessage(chat.id, message);

    return {
      update_id: this.updateIdCounter++,
      message,
    } as Update;
  }

  /**
   * Simulate user sending venue.
   */
  simulateVenueMessage(
    user: User,
    chat: Chat,
    options: {
      latitude: number;
      longitude: number;
      title: string;
      address: string;
    }
  ): Update {
    this.ensureChat(chat);
    this.ensureChatMember(chat.id, user);

    const message = this.cleanObject({
      message_id: this.messageIdCounter++,
      date: this.timestamp(),
      chat,
      from: user,
      venue: {
        location: {
          latitude: options.latitude,
          longitude: options.longitude,
        },
        title: options.title,
        address: options.address,
      },
    }) as unknown as Message.VenueMessage;

    this.chatState.storeMessage(chat.id, message);

    return {
      update_id: this.updateIdCounter++,
      message,
    } as Update;
  }

  /**
   * Simulate a pre-checkout query.
   */
  simulatePreCheckoutQuery(
    user: User,
    query: {
      id: string;
      currency: string;
      total_amount: number;
      invoice_payload: string;
      order_info?: {
        name?: string;
        email?: string;
        phone_number?: string;
        shipping_address?: {
          country_code: string;
          state: string;
          city: string;
          street_line1: string;
          street_line2: string;
          post_code: string;
        };
      };
    }
  ): Update {
    return {
      update_id: this.updateIdCounter++,
      pre_checkout_query: {
        id: query.id,
        from: user,
        currency: query.currency,
        total_amount: query.total_amount,
        invoice_payload: query.invoice_payload,
        order_info: query.order_info,
      },
    } as Update;
  }

  /**
   * Simulate a successful payment message.
   */
  simulateSuccessfulPayment(
    user: User,
    chat: Chat,
    payment: {
      currency: string;
      total_amount: number;
      invoice_payload: string;
      telegram_payment_charge_id: string;
      provider_payment_charge_id: string;
      order_info?: {
        name?: string;
        email?: string;
        phone_number?: string;
      };
    }
  ): Update {
    this.ensureChat(chat);

    const message = this.cleanObject({
      message_id: this.messageIdCounter++,
      date: this.timestamp(),
      chat,
      from: user,
      successful_payment: {
        currency: payment.currency,
        total_amount: payment.total_amount,
        invoice_payload: payment.invoice_payload,
        telegram_payment_charge_id: payment.telegram_payment_charge_id,
        provider_payment_charge_id: payment.provider_payment_charge_id,
        order_info: payment.order_info,
      },
    }) as unknown as Message.SuccessfulPaymentMessage;

    this.chatState.storeMessage(chat.id, message);

    return {
      update_id: this.updateIdCounter++,
      message,
    } as Update;
  }

  /**
   * Simulate a shipping query.
   */
  simulateShippingQuery(
    user: User,
    query: {
      id: string;
      invoice_payload: string;
      shipping_address: {
        country_code: string;
        state: string;
        city: string;
        street_line1: string;
        street_line2: string;
        post_code: string;
      };
    }
  ): Update {
    return {
      update_id: this.updateIdCounter++,
      shipping_query: {
        id: query.id,
        from: user,
        invoice_payload: query.invoice_payload,
        shipping_address: query.shipping_address,
      },
    } as Update;
  }

  /**
   * Simulate a reaction count update (for anonymous reactions in channels).
   */
  simulateReactionCountUpdate(
    chat: Chat,
    messageId: number,
    reactions: Array<{
      type: ReactionType;
      total_count: number;
    }>
  ): Update {
    return {
      update_id: this.updateIdCounter++,
      message_reaction_count: {
        chat,
        message_id: messageId,
        date: this.timestamp(),
        reactions,
      },
    } as Update;
  }

  /**
   * Simulate an anonymous reaction (without user info).
   */
  simulateAnonymousReaction(
    chat: Chat,
    messageId: number,
    newReactions: ReactionType[],
    oldReactions: ReactionType[]
  ): Update {
    return {
      update_id: this.updateIdCounter++,
      message_reaction: {
        chat,
        message_id: messageId,
        date: this.timestamp(),
        old_reaction: oldReactions,
        new_reaction: newReactions,
      },
    } as Update;
  }

  // === Query State ===

  getBotMessages(chatId: number): Message[] {
    const messages = this.chatState.getAllMessages(chatId);
    return messages.filter((m) => m.from?.id === this.botInfo.id);
  }

  getLastBotMessage(chatId: number): Message | undefined {
    const messages = this.getBotMessages(chatId);
    return messages[messages.length - 1];
  }

  getAllMessages(chatId: number): Message[] {
    return this.chatState.getAllMessages(chatId);
  }

  getMessage(chatId: number, messageId: number): Message | undefined {
    return this.chatState.getMessage(chatId, messageId);
  }

  getCallbackQueryAnswer(queryId: string): PendingCallbackQuery | undefined {
    return this.pendingCallbackQueries.get(queryId);
  }

  getAllCallbackQueryAnswers(): PendingCallbackQuery[] {
    return Array.from(this.pendingCallbackQueries.values()).filter((q) => q.answered);
  }

  getInlineQueryAnswer(queryId: string): PendingInlineQuery | undefined {
    return this.pendingInlineQueries.get(queryId);
  }

  // === Invite Links ===

  getInviteLinks(chatId: number): StoredInviteLink[] {
    return this.chatState.getInviteLinks(chatId);
  }

  getInviteLink(chatId: number, inviteLink: string): StoredInviteLink | undefined {
    return this.chatState.getInviteLink(chatId, inviteLink);
  }

  // === Chat Members ===

  getChatMember(chatId: number, userId: number): ChatMember | undefined {
    return this.memberState.toChatMember(chatId, userId);
  }

  // === Polls ===

  getStoredPoll(pollId: string): StoredPoll | undefined {
    return this.pollState.getStoredPoll(pollId);
  }

  getPoll(pollId: string): Poll | undefined {
    return this.pollState.getPoll(pollId);
  }

  // === Files ===

  getFile(fileId: string): File | undefined {
    return this.fileState.getFileInfo(fileId);
  }

  // === State Management ===

  reset(): void {
    this.updateIdCounter = 1;
    this.messageIdCounter = 1;
    this.callbackQueryIdCounter = 1;
    this.inlineQueryIdCounter = 1;
    this.pendingCallbackQueries.clear();
    this.pendingInlineQueries.clear();
    this.messageReactions.clear();
    this.chatState.reset();
    this.memberState.reset();
    this.pollState.reset();
    this.fileState.reset();
    this.updateFactory.reset();
    this.currentResponse = null;
  }

  private ensureChat(chat: Chat): void {
    this.chatState.getOrCreate(chat);
  }

  private ensureChatMember(chatId: number, user: User): void {
    if (!this.memberState.getMember(chatId, user.id)) {
      this.memberState.setMember(chatId, user, "member");
    }
  }

  // === API Method Handlers ===

  private apiHandlers: Record<string, (payload: Record<string, unknown>) => unknown> = {
    getMe: () => this.botInfo,

    getUpdates: () => {
      // Used by polling - return empty by default
      return [];
    },

    deleteWebhook: () => true,

    setWebhook: () => true,

    getWebhookInfo: () => ({
      url: "",
      has_custom_certificate: false,
      pending_update_count: 0,
    }),

    // === Messages ===

    sendMessage: (payload) => {
      const chatId = payload.chat_id as number;
      const text = payload.text as string;
      const replyMarkup = payload.reply_markup;
      const parseMode = payload.parse_mode as ParseMode | undefined;
      const replyToMessageId = payload.reply_to_message_id as number | undefined;
      const messageThreadId = payload.message_thread_id as number | undefined;

      const chatData = this.chatState.get(chatId);
      if (!chatData) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      // Check rate limits
      const rateCheck = this.memberState.checkRateLimit(
        chatId,
        this.botInfo.id,
        chatData.chat.type,
        this.chatState.getSlowModeDelay(chatId)
      );
      if (!rateCheck.allowed) {
        throw this.createApiError(429, "Too Many Requests: retry after " + rateCheck.retryAfter, {
          retry_after: rateCheck.retryAfter,
        });
      }

      // Check if chat is locked
      if (this.chatState.isLocked(chatId)) {
        throw this.createApiError(400, "Bad Request: not enough rights to send text messages to the chat");
      }

      let finalText = text;
      let entities: MessageEntity[] | undefined;

      if (parseMode) {
        const parsed = parseFormattedText(text, parseMode);
        finalText = parsed.text;
        entities = parsed.entities.length > 0 ? parsed.entities : undefined;
      } else if (payload.entities) {
        entities = payload.entities as MessageEntity[];
      }

      const message = this.cleanObject({
        message_id: this.messageIdCounter++,
        date: this.timestamp(),
        chat: chatData.chat,
        from: this.botInfo,
        text: finalText,
        entities,
        reply_markup: replyMarkup,
        reply_to_message: replyToMessageId
          ? this.chatState.getMessage(chatId, replyToMessageId)
          : undefined,
        message_thread_id: messageThreadId,
      }) as unknown as Message.TextMessage;

      this.chatState.storeMessage(chatId, message);

      // Track in current response
      if (this.currentResponse) {
        this.currentResponse._addMessage(message);
      }

      return message;
    },

    forwardMessage: (payload) => {
      const chatId = payload.chat_id as number;
      const fromChatId = payload.from_chat_id as number;
      const messageId = payload.message_id as number;

      const chatData = this.chatState.get(chatId);
      if (!chatData) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      const originalMessage = this.chatState.getMessage(fromChatId, messageId);
      if (!originalMessage) {
        throw this.createApiError(400, "Bad Request: message not found");
      }

      const message = {
        ...originalMessage,
        message_id: this.messageIdCounter++,
        date: this.timestamp(),
        chat: chatData.chat,
        forward_date: originalMessage.date,
        forward_from: originalMessage.from,
      } as Message;

      this.chatState.storeMessage(chatId, message);

      if (this.currentResponse) {
        this.currentResponse._addMessage(message);
      }

      return message;
    },

    copyMessage: (payload) => {
      const chatId = payload.chat_id as number;
      const fromChatId = payload.from_chat_id as number;
      const messageId = payload.message_id as number;

      const chatData = this.chatState.get(chatId);
      if (!chatData) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      const originalMessage = this.chatState.getMessage(fromChatId, messageId);
      if (!originalMessage) {
        throw this.createApiError(400, "Bad Request: message not found");
      }

      const newMessageId = this.messageIdCounter++;

      const message = {
        ...originalMessage,
        message_id: newMessageId,
        date: this.timestamp(),
        chat: chatData.chat,
        from: this.botInfo,
      } as Message;

      // Remove forward info (it's a copy, not forward)
      delete (message as unknown as Record<string, unknown>).forward_date;
      delete (message as unknown as Record<string, unknown>).forward_from;

      this.chatState.storeMessage(chatId, message);

      if (this.currentResponse) {
        this.currentResponse._addMessage(message);
      }

      return { message_id: newMessageId };
    },

    editMessageText: (payload) => {
      const chatId = payload.chat_id as number | undefined;
      const messageId = payload.message_id as number | undefined;
      const text = payload.text as string;
      const parseMode = payload.parse_mode as ParseMode | undefined;
      const replyMarkup = payload.reply_markup;

      if (chatId && messageId) {
        const message = this.chatState.getMessage(chatId, messageId);
        if (!message) {
          throw this.createApiError(400, "Bad Request: message not found");
        }

        let finalText = text;
        let entities: MessageEntity[] | undefined;

        if (parseMode) {
          const parsed = parseFormattedText(text, parseMode);
          finalText = parsed.text;
          entities = parsed.entities.length > 0 ? parsed.entities : undefined;
        }

        (message as Message.TextMessage).text = finalText;
        if (entities) {
          (message as Message.TextMessage).entities = entities;
        }
        if (replyMarkup) {
          (message as unknown as Record<string, unknown>).reply_markup = replyMarkup;
        }

        if (this.currentResponse) {
          this.currentResponse._addEditedMessage(message);
        }

        return message;
      }

      return true;
    },

    editMessageCaption: (payload) => {
      const chatId = payload.chat_id as number | undefined;
      const messageId = payload.message_id as number | undefined;
      const caption = payload.caption as string | undefined;
      const parseMode = payload.parse_mode as ParseMode | undefined;
      const replyMarkup = payload.reply_markup;

      if (chatId && messageId) {
        const message = this.chatState.getMessage(chatId, messageId);
        if (!message) {
          throw this.createApiError(400, "Bad Request: message not found");
        }

        let finalCaption = caption;
        let captionEntities: MessageEntity[] | undefined;

        if (parseMode && caption) {
          const parsed = parseFormattedText(caption, parseMode);
          finalCaption = parsed.text;
          captionEntities = parsed.entities.length > 0 ? parsed.entities : undefined;
        }

        (message as unknown as Record<string, unknown>).caption = finalCaption;
        if (captionEntities) {
          (message as unknown as Record<string, unknown>).caption_entities = captionEntities;
        }
        if (replyMarkup) {
          (message as unknown as Record<string, unknown>).reply_markup = replyMarkup;
        }

        if (this.currentResponse) {
          this.currentResponse._addEditedMessage(message);
        }

        return message;
      }

      return true;
    },

    editMessageReplyMarkup: (payload) => {
      const chatId = payload.chat_id as number | undefined;
      const messageId = payload.message_id as number | undefined;
      const replyMarkup = payload.reply_markup;

      if (chatId && messageId) {
        const message = this.chatState.getMessage(chatId, messageId);
        if (!message) {
          throw this.createApiError(400, "Bad Request: message not found");
        }

        (message as unknown as Record<string, unknown>).reply_markup = replyMarkup;

        if (this.currentResponse) {
          this.currentResponse._addEditedMessage(message);
        }

        return message;
      }

      return true;
    },

    deleteMessage: (payload) => {
      const chatId = payload.chat_id as number;
      const messageId = payload.message_id as number;

      // Get the message to check ownership
      const message = this.chatState.getMessage(chatId, messageId);
      if (!message) {
        throw this.createApiError(400, "Bad Request: message to delete not found");
      }

      // Check if this is the bot's own message
      const isBotMessage = message.from?.id === this.botInfo.id;

      // In groups/supergroups/channels, bot needs can_delete_messages to delete others' messages
      // In private chats, bot can delete any message (both its own and user's messages)
      if (!isBotMessage && !this.isPrivateChat(chatId)) {
        this.requireBotPermission(chatId, "can_delete_messages", "delete messages");
      }

      const deleted = this.chatState.deleteMessage(chatId, messageId);
      if (!deleted) {
        throw this.createApiError(400, "Bad Request: message to delete not found");
      }

      if (this.currentResponse) {
        this.currentResponse._addDeletedMessageId(messageId);
      }

      return true;
    },

    // === Callback Queries ===

    answerCallbackQuery: (payload) => {
      const queryId = payload.callback_query_id as string;
      const text = payload.text as string | undefined;
      const showAlert = payload.show_alert as boolean | undefined;
      const url = payload.url as string | undefined;
      const cacheTime = payload.cache_time as number | undefined;

      const pending = this.pendingCallbackQueries.get(queryId);
      if (!pending) {
        throw this.createApiError(400, "Bad Request: query is too old and response timeout expired or query ID is invalid");
      }

      if (pending.answered) {
        throw this.createApiError(400, "Bad Request: query is already answered");
      }

      pending.answered = true;
      pending.answerText = text;
      pending.answerAlert = showAlert;
      pending.answerUrl = url;
      pending.answerCacheTime = cacheTime;

      if (this.currentResponse) {
        this.currentResponse._setCallbackAnswer({
          text,
          showAlert,
          url,
          cacheTime,
        });
      }

      return true;
    },

    // === Inline Queries ===

    answerInlineQuery: (payload) => {
      const queryId = payload.inline_query_id as string;
      const results = payload.results as InlineQueryResult[];
      const cacheTime = payload.cache_time as number | undefined;
      const isPersonal = payload.is_personal as boolean | undefined;
      const nextOffset = payload.next_offset as string | undefined;
      const switchPmText = payload.switch_pm_text as string | undefined;
      const switchPmParameter = payload.switch_pm_parameter as string | undefined;

      const pending = this.pendingInlineQueries.get(queryId);
      if (!pending) {
        throw this.createApiError(400, "Bad Request: query is too old and response timeout expired or query ID is invalid");
      }

      if (pending.answered) {
        throw this.createApiError(400, "Bad Request: query is already answered");
      }

      pending.answered = true;
      pending.results = results;
      pending.cacheTime = cacheTime;
      pending.isPersonal = isPersonal;
      pending.nextOffset = nextOffset;
      pending.switchPmText = switchPmText;
      pending.switchPmParameter = switchPmParameter;

      if (this.currentResponse) {
        this.currentResponse._setInlineResults(results);
      }

      return true;
    },

    // === Chat Info ===

    getChat: (payload) => {
      const chatId = payload.chat_id as number;
      const chatData = this.chatState.get(chatId);
      if (!chatData) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      return this.cleanObject({
        ...chatData.chat,
        permissions: chatData.permissions,
        slow_mode_delay: chatData.slowModeDelay,
        description: chatData.description,
        bio: chatData.bio,
        has_protected_content: false,
        is_forum: chatData.isForum,
      });
    },

    getChatMember: (payload) => {
      const chatId = payload.chat_id as number;
      const userId = payload.user_id as number;

      if (!this.chatState.has(chatId)) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      const member = this.memberState.toChatMember(chatId, userId);
      if (!member) {
        return {
          status: "left",
          user: { id: userId, is_bot: false, first_name: "Unknown" },
        };
      }

      return member;
    },

    getChatAdministrators: (payload) => {
      const chatId = payload.chat_id as number;

      if (!this.chatState.has(chatId)) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      const admins = this.memberState.getAdministrators(chatId);
      return admins.map((m) => this.memberState.toChatMember(chatId, m.user.id)).filter(Boolean);
    },

    getChatMemberCount: (payload) => {
      const chatId = payload.chat_id as number;

      if (!this.chatState.has(chatId)) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      return this.memberState.getAllMembers(chatId).filter((m) =>
        m.status !== "left" && m.status !== "kicked"
      ).length;
    },

    // === Chat Permissions ===

    setChatPermissions: (payload) => {
      const chatId = payload.chat_id as number;
      const permissions = payload.permissions as ChatPermissions;

      if (!this.chatState.has(chatId)) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      // Check bot has permission to restrict members
      this.requireBotPermission(chatId, "can_restrict_members", "change chat permissions");

      this.chatState.setPermissions(chatId, permissions);
      return true;
    },

    // === Slow Mode ===

    setChatSlowModeDelay: (payload) => {
      const chatId = payload.chat_id as number;
      const delay = payload.slow_mode_delay as number;

      if (!this.chatState.has(chatId)) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      // Slow mode requires can_restrict_members permission (not can_change_info)
      this.requireBotPermission(chatId, "can_restrict_members", "change chat slow mode");

      if (!this.chatState.setSlowModeDelay(chatId, delay)) {
        throw this.createApiError(400, "Bad Request: SLOW_MODE_DELAY_INVALID");
      }

      return true;
    },

    // === Member Management ===

    banChatMember: (payload) => {
      const chatId = payload.chat_id as number;
      const userId = payload.user_id as number;
      const untilDate = payload.until_date as number | undefined;

      if (!this.chatState.has(chatId)) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      // Check bot has permission to restrict members
      this.requireBotPermission(chatId, "can_restrict_members", "restrict/unrestrict chat member");

      // Can't ban other admins (unless bot is creator)
      const targetMember = this.memberState.getMember(chatId, userId);
      if (targetMember && (targetMember.status === "administrator" || targetMember.status === "creator")) {
        const botMember = this.memberState.getMember(chatId, this.botInfo.id);
        if (botMember?.status !== "creator") {
          throw this.createApiError(400, "Bad Request: can't restrict self-administrator");
        }
      }

      if (!this.memberState.ban(chatId, userId, untilDate)) {
        throw this.createApiError(400, "Bad Request: can't ban this user");
      }

      return true;
    },

    unbanChatMember: (payload) => {
      const chatId = payload.chat_id as number;
      const userId = payload.user_id as number;

      if (!this.chatState.has(chatId)) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      // Check bot has permission to restrict members
      this.requireBotPermission(chatId, "can_restrict_members", "restrict/unrestrict chat member");

      this.memberState.unban(chatId, userId);
      return true;
    },

    restrictChatMember: (payload) => {
      const chatId = payload.chat_id as number;
      const userId = payload.user_id as number;
      // Handle both direct permissions and nested permissions.permissions (grammY wraps it)
      const payloadPerms = payload.permissions as ChatPermissions | { permissions: ChatPermissions; until_date?: number };
      const permissions = (payloadPerms && "permissions" in payloadPerms)
        ? payloadPerms.permissions as ChatPermissions
        : payloadPerms;
      // until_date might be at root or inside the permissions wrapper
      const untilDate = (payload.until_date as number | undefined)
        ?? (payloadPerms && "until_date" in payloadPerms ? payloadPerms.until_date : undefined);

      if (!this.chatState.has(chatId)) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      // Check bot has permission to restrict members
      this.requireBotPermission(chatId, "can_restrict_members", "restrict/unrestrict chat member");

      // Can't restrict other admins
      const targetMember = this.memberState.getMember(chatId, userId);
      if (targetMember && (targetMember.status === "administrator" || targetMember.status === "creator")) {
        throw this.createApiError(400, "Bad Request: can't restrict self-administrator");
      }

      if (!this.memberState.restrict(chatId, userId, permissions, untilDate)) {
        throw this.createApiError(400, "Bad Request: can't restrict this user");
      }

      return true;
    },

    promoteChatMember: (payload) => {
      const chatId = payload.chat_id as number;
      const userId = payload.user_id as number;

      if (!this.chatState.has(chatId)) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      // Check bot has permission to promote members
      this.requireBotPermission(chatId, "can_promote_members", "promote new admins");

      const member = this.memberState.getMember(chatId, userId);
      if (!member) {
        throw this.createApiError(400, "Bad Request: user not found");
      }

      // Check if any admin rights are being granted
      const hasAnyRight = Object.entries(payload).some(
        ([key, value]) => key.startsWith("can_") && value === true
      );

      if (hasAnyRight) {
        this.memberState.setAdmin(chatId, member.user, {
          can_manage_chat: payload.can_manage_chat as boolean | undefined,
          can_delete_messages: payload.can_delete_messages as boolean | undefined,
          can_manage_video_chats: payload.can_manage_video_chats as boolean | undefined,
          can_restrict_members: payload.can_restrict_members as boolean | undefined,
          can_promote_members: payload.can_promote_members as boolean | undefined,
          can_change_info: payload.can_change_info as boolean | undefined,
          can_invite_users: payload.can_invite_users as boolean | undefined,
          can_post_stories: payload.can_post_stories as boolean | undefined,
          can_edit_stories: payload.can_edit_stories as boolean | undefined,
          can_delete_stories: payload.can_delete_stories as boolean | undefined,
          can_pin_messages: payload.can_pin_messages as boolean | undefined,
          can_manage_topics: payload.can_manage_topics as boolean | undefined,
        });
      } else {
        // Demote
        this.memberState.demote(chatId, userId);
      }

      return true;
    },

    setChatAdministratorCustomTitle: (payload) => {
      const chatId = payload.chat_id as number;
      const userId = payload.user_id as number;
      const customTitle = payload.custom_title as string;

      // Check bot has permission to promote members (required for setting titles)
      this.requireBotPermission(chatId, "can_promote_members", "set custom admin titles");

      const member = this.memberState.getMember(chatId, userId);
      if (!member || member.status !== "administrator") {
        throw this.createApiError(400, "Bad Request: user is not an administrator");
      }

      member.custom_title = customTitle;
      return true;
    },

    // === Invite Links ===

    createChatInviteLink: (payload) => {
      const chatId = payload.chat_id as number;
      const name = payload.name as string | undefined;
      const expireDate = payload.expire_date as number | undefined;
      const memberLimit = payload.member_limit as number | undefined;
      const createsJoinRequest = payload.creates_join_request as boolean | undefined;

      if (!this.chatState.has(chatId)) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      // Check bot has permission to invite users
      this.requireBotPermission(chatId, "can_invite_users", "invite users via link");

      const link = this.chatState.createInviteLink(chatId, this.botInfo, {
        name,
        expireDate,
        memberLimit,
        createsJoinRequest,
      });

      if (!link) {
        throw this.createApiError(400, "Bad Request: can't create invite link");
      }

      if (this.currentResponse) {
        this.currentResponse._setInviteLink(link);
      }

      return link as ChatInviteLink;
    },

    editChatInviteLink: (payload) => {
      const chatId = payload.chat_id as number;
      const inviteLink = payload.invite_link as string;
      const name = payload.name as string | undefined;
      const expireDate = payload.expire_date as number | undefined;
      const memberLimit = payload.member_limit as number | undefined;
      const createsJoinRequest = payload.creates_join_request as boolean | undefined;

      // Check bot has permission to invite users
      this.requireBotPermission(chatId, "can_invite_users", "edit invite link");

      const link = this.chatState.editInviteLink(chatId, inviteLink, {
        name,
        expireDate,
        memberLimit,
        createsJoinRequest,
      });

      if (!link) {
        throw this.createApiError(400, "Bad Request: invite link not found or revoked");
      }

      return link as ChatInviteLink;
    },

    createChatSubscriptionInviteLink: (payload) => {
      const chatId = payload.chat_id as number;
      const name = payload.name as string | undefined;
      const subscriptionPeriod = payload.subscription_period as number;
      const subscriptionPrice = payload.subscription_price as number;

      if (!this.chatState.has(chatId)) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      // Check bot has permission to invite users
      this.requireBotPermission(chatId, "can_invite_users", "create subscription invite link");

      const link = this.chatState.createInviteLink(chatId, this.botInfo, {
        name,
        subscriptionPeriod,
        subscriptionPrice,
      });

      if (!link) {
        throw this.createApiError(400, "Bad Request: can't create subscription invite link");
      }

      if (this.currentResponse) {
        this.currentResponse._setInviteLink(link);
      }

      return link as ChatInviteLink;
    },

    editChatSubscriptionInviteLink: (payload) => {
      const chatId = payload.chat_id as number;
      const inviteLink = payload.invite_link as string;
      const name = payload.name as string | undefined;

      // Check bot has permission to invite users
      this.requireBotPermission(chatId, "can_invite_users", "edit subscription invite link");

      const link = this.chatState.editInviteLink(chatId, inviteLink, { name });

      if (!link) {
        throw this.createApiError(400, "Bad Request: subscription invite link not found");
      }

      return link as ChatInviteLink;
    },

    revokeChatInviteLink: (payload) => {
      const chatId = payload.chat_id as number;
      const inviteLink = payload.invite_link as string;

      // Check bot has permission to invite users
      this.requireBotPermission(chatId, "can_invite_users", "revoke invite link");

      const link = this.chatState.revokeInviteLink(chatId, inviteLink);

      if (!link) {
        throw this.createApiError(400, "Bad Request: invite link not found");
      }

      return link as ChatInviteLink;
    },

    exportChatInviteLink: (payload) => {
      const chatId = payload.chat_id as number;

      // Check bot has permission to invite users
      this.requireBotPermission(chatId, "can_invite_users", "export invite link");

      const link = this.chatState.exportInviteLink(chatId, this.botInfo);

      if (!link) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      return link;
    },

    approveChatJoinRequest: (payload) => {
      const chatId = payload.chat_id as number;
      const userId = payload.user_id as number;

      // Check bot has permission to invite users
      this.requireBotPermission(chatId, "can_invite_users", "approve join requests");

      // Find the invite link with this pending request
      const links = this.chatState.getInviteLinks(chatId);
      for (const link of links) {
        if (link.pendingRequestUserIds.has(userId)) {
          // Get the stored user from the join request
          const user = this.chatState.getJoinRequestUser(chatId, userId);
          // Remove from pending
          this.chatState.removeJoinRequest(chatId, link.invite_link, userId);
          // Add as member
          if (user) {
            this.memberState.setMember(chatId, user, "member");
          }
          return true;
        }
      }

      throw this.createApiError(400, "Bad Request: user has no join request");
    },

    declineChatJoinRequest: (payload) => {
      const chatId = payload.chat_id as number;
      const userId = payload.user_id as number;

      // Check bot has permission to invite users
      this.requireBotPermission(chatId, "can_invite_users", "decline join requests");

      // Find the invite link with this pending request
      const links = this.chatState.getInviteLinks(chatId);
      for (const link of links) {
        if (link.pendingRequestUserIds.has(userId)) {
          this.chatState.removeJoinRequest(chatId, link.invite_link, userId);
          return true;
        }
      }

      throw this.createApiError(400, "Bad Request: user has no join request");
    },

    // === Pin Messages ===

    pinChatMessage: (payload) => {
      const chatId = payload.chat_id as number;
      const messageId = payload.message_id as number;

      // Check bot has permission to pin messages
      this.requireBotPermission(chatId, "can_pin_messages", "pin messages");

      if (!this.chatState.pinMessage(chatId, messageId)) {
        throw this.createApiError(400, "Bad Request: message not found");
      }

      return true;
    },

    unpinChatMessage: (payload) => {
      const chatId = payload.chat_id as number;
      const messageId = payload.message_id as number | undefined;

      // Check bot has permission to pin messages
      this.requireBotPermission(chatId, "can_pin_messages", "unpin messages");

      if (messageId) {
        this.chatState.unpinMessage(chatId, messageId);
      } else {
        // Unpin the most recent pinned message
        const pinnedIds = this.chatState.getPinnedMessageIds(chatId);
        if (pinnedIds.length > 0) {
          this.chatState.unpinMessage(chatId, pinnedIds[pinnedIds.length - 1]);
        }
      }

      return true;
    },

    unpinAllChatMessages: (payload) => {
      const chatId = payload.chat_id as number;

      // Check bot has permission to pin messages
      this.requireBotPermission(chatId, "can_pin_messages", "unpin messages");

      this.chatState.unpinAllMessages(chatId);
      return true;
    },

    // === Polls ===

    sendPoll: (payload) => {
      const chatId = payload.chat_id as number;
      const question = payload.question as string;
      const rawOptions = payload.options as (string | { text: string })[];
      const isAnonymous = payload.is_anonymous as boolean | undefined;
      const type = payload.type as "quiz" | "regular" | undefined;
      const allowsMultipleAnswers = payload.allows_multiple_answers as boolean | undefined;
      const correctOptionId = payload.correct_option_id as number | undefined;
      const explanation = payload.explanation as string | undefined;
      const openPeriod = payload.open_period as number | undefined;
      const closeDate = payload.close_date as number | undefined;

      const chatData = this.chatState.get(chatId);
      if (!chatData) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      // Handle both string[] and InputPollOption[] formats
      const pollOptions: PollOption[] = rawOptions.map((opt) => ({
        text: typeof opt === "string" ? opt : opt.text,
        voter_count: 0,
      }));

      const poll: Poll = this.cleanObject({
        id: String(this.pollState["polls"].size + 1),
        question,
        options: pollOptions,
        total_voter_count: 0,
        is_closed: false,
        is_anonymous: isAnonymous ?? true,
        type: type ?? "regular",
        allows_multiple_answers: allowsMultipleAnswers ?? false,
        correct_option_id: correctOptionId,
        explanation,
        open_period: openPeriod,
        close_date: closeDate,
      });

      const messageId = this.messageIdCounter++;

      const message: Message.PollMessage = {
        message_id: messageId,
        date: this.timestamp(),
        chat: chatData.chat,
        from: this.botInfo,
        poll,
      };

      this.chatState.storeMessage(chatId, message);
      this.pollState.createPoll(poll, chatId, messageId, this.botInfo.id);

      if (this.currentResponse) {
        this.currentResponse._addMessage(message);
        this.currentResponse._setPoll(poll);
      }

      return message;
    },

    stopPoll: (payload) => {
      const chatId = payload.chat_id as number;
      const messageId = payload.message_id as number;

      const poll = this.pollState.stopPollByMessage(chatId, messageId);
      if (!poll) {
        throw this.createApiError(400, "Bad Request: poll not found or already stopped");
      }

      return poll;
    },

    // === Forum Topics ===

    createForumTopic: (payload) => {
      const chatId = payload.chat_id as number;
      const name = payload.name as string;
      const iconColor = payload.icon_color as number | undefined;
      const iconCustomEmojiId = payload.icon_custom_emoji_id as string | undefined;

      // Check bot has permission to manage topics
      this.requireBotPermission(chatId, "can_manage_topics", "create forum topics");

      const topic = this.chatState.createForumTopic(chatId, name, {
        iconColor,
        iconCustomEmojiId,
      });

      if (!topic) {
        throw this.createApiError(400, "Bad Request: chat is not a forum");
      }

      return topic;
    },

    editForumTopic: (payload) => {
      const chatId = payload.chat_id as number;
      const messageThreadId = payload.message_thread_id as number;
      const name = payload.name as string | undefined;
      const iconCustomEmojiId = payload.icon_custom_emoji_id as string | undefined;

      // Check bot has permission to manage topics
      this.requireBotPermission(chatId, "can_manage_topics", "edit forum topics");

      if (!this.chatState.editForumTopic(chatId, messageThreadId, { name, iconCustomEmojiId })) {
        throw this.createApiError(400, "Bad Request: topic not found");
      }

      return true;
    },

    closeForumTopic: (payload) => {
      const chatId = payload.chat_id as number;
      const messageThreadId = payload.message_thread_id as number;

      // Check bot has permission to manage topics
      this.requireBotPermission(chatId, "can_manage_topics", "close forum topics");

      if (!this.chatState.closeForumTopic(chatId, messageThreadId)) {
        throw this.createApiError(400, "Bad Request: topic not found");
      }

      return true;
    },

    reopenForumTopic: (payload) => {
      const chatId = payload.chat_id as number;
      const messageThreadId = payload.message_thread_id as number;

      // Check bot has permission to manage topics
      this.requireBotPermission(chatId, "can_manage_topics", "reopen forum topics");

      if (!this.chatState.reopenForumTopic(chatId, messageThreadId)) {
        throw this.createApiError(400, "Bad Request: topic not found");
      }

      return true;
    },

    deleteForumTopic: (payload) => {
      const chatId = payload.chat_id as number;
      const messageThreadId = payload.message_thread_id as number;

      // Check bot has permission to manage topics
      this.requireBotPermission(chatId, "can_manage_topics", "delete forum topics");

      if (!this.chatState.deleteForumTopic(chatId, messageThreadId)) {
        throw this.createApiError(400, "Bad Request: topic not found or is the general topic");
      }

      return true;
    },

    hideGeneralForumTopic: (payload) => {
      const chatId = payload.chat_id as number;

      // Check bot has permission to manage topics
      this.requireBotPermission(chatId, "can_manage_topics", "hide general forum topic");

      if (!this.chatState.setGeneralTopicHidden(chatId, true)) {
        throw this.createApiError(400, "Bad Request: chat is not a forum");
      }

      return true;
    },

    unhideGeneralForumTopic: (payload) => {
      const chatId = payload.chat_id as number;

      // Check bot has permission to manage topics
      this.requireBotPermission(chatId, "can_manage_topics", "unhide general forum topic");

      if (!this.chatState.setGeneralTopicHidden(chatId, false)) {
        throw this.createApiError(400, "Bad Request: chat is not a forum");
      }

      return true;
    },

    unpinAllForumTopicMessages: (payload) => {
      const chatId = payload.chat_id as number;
      // const messageThreadId = payload.message_thread_id as number;

      // Check bot has permission to pin messages
      this.requireBotPermission(chatId, "can_pin_messages", "unpin forum topic messages");

      // Just return true - we don't track topic-specific pins
      const state = this.chatState.get(chatId);
      if (!state || !state.isForum) {
        throw this.createApiError(400, "Bad Request: chat is not a forum");
      }
      return true;
    },

    // === Payments ===

    answerPreCheckoutQuery: (payload) => {
      const preCheckoutQueryId = payload.pre_checkout_query_id as string;
      const ok = payload.ok as boolean;
      const errorMessage = payload.error_message as string | undefined;

      if (!ok && !errorMessage) {
        throw this.createApiError(400, "Bad Request: error_message is required when ok is false");
      }

      if (this.currentResponse) {
        this.currentResponse._setPreCheckoutAnswer({ ok, errorMessage });
      }

      return true;
    },

    sendInvoice: (payload) => {
      const chatId = payload.chat_id as number;
      const title = payload.title as string;
      const description = payload.description as string;
      const invoicePayload = payload.payload as string;
      const providerToken = payload.provider_token as string;
      const currency = payload.currency as string;
      const prices = payload.prices as Array<{ label: string; amount: number }>;

      const chatData = this.chatState.get(chatId);
      if (!chatData) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      const totalAmount = prices.reduce((sum, p) => sum + p.amount, 0);

      const message = {
        message_id: this.messageIdCounter++,
        date: this.timestamp(),
        chat: chatData.chat,
        from: this.botInfo,
        invoice: {
          title,
          description,
          start_parameter: "",
          currency,
          total_amount: totalAmount,
        },
      } as Message.InvoiceMessage;

      this.chatState.storeMessage(chatId, message);

      if (this.currentResponse) {
        this.currentResponse._addMessage(message);
        this.currentResponse._setInvoice(message.invoice);
      }

      return message;
    },

    // === Reactions ===

    setMessageReaction: (payload) => {
      const chatId = payload.chat_id as number;
      const messageId = payload.message_id as number;
      const reaction = payload.reaction as ReactionType[] | undefined;

      if (!this.chatState.getMessage(chatId, messageId)) {
        throw this.createApiError(400, "Bad Request: message not found");
      }

      const key = `${chatId}:${messageId}`;
      let reactionState = this.messageReactions.get(key);

      if (!reactionState) {
        reactionState = {
          messageId,
          chatId,
          reactions: new Map(),
        };
        this.messageReactions.set(key, reactionState);
      }

      // Bot's reactions are stored with bot's ID
      reactionState.reactions.set(this.botInfo.id, reaction ?? []);

      return true;
    },

    // === Files ===

    getFile: (payload) => {
      const fileId = payload.file_id as string;
      const file = this.fileState.getFileInfo(fileId);

      if (!file) {
        throw this.createApiError(400, "Bad Request: file not found");
      }

      return file;
    },

    sendPhoto: (payload) => this.handleSendMedia(payload, "photo"),
    sendDocument: (payload) => this.handleSendMedia(payload, "document"),
    sendVideo: (payload) => this.handleSendMedia(payload, "video"),
    sendAudio: (payload) => this.handleSendMedia(payload, "audio"),
    sendVoice: (payload) => this.handleSendMedia(payload, "voice"),
    sendVideoNote: (payload) => this.handleSendMedia(payload, "video_note"),
    sendSticker: (payload) => this.handleSendMedia(payload, "sticker"),
    sendAnimation: (payload) => this.handleSendMedia(payload, "animation"),

    // === Stickers ===

    getStickerSet: () => {
      throw this.createApiError(400, "Bad Request: sticker set not found");
    },

    // === Additional Message Types ===

    sendLocation: (payload) => {
      const chatId = payload.chat_id as number;
      const latitude = payload.latitude as number;
      const longitude = payload.longitude as number;

      const chatData = this.chatState.get(chatId);
      if (!chatData) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      const message = this.cleanObject({
        message_id: this.messageIdCounter++,
        date: this.timestamp(),
        chat: chatData.chat,
        from: this.botInfo,
        location: { latitude, longitude },
      }) as Message;

      this.chatState.storeMessage(chatId, message);
      if (this.currentResponse) {
        this.currentResponse._addMessage(message);
      }
      return message;
    },

    sendVenue: (payload) => {
      const chatId = payload.chat_id as number;
      const latitude = payload.latitude as number;
      const longitude = payload.longitude as number;
      const title = payload.title as string;
      const address = payload.address as string;

      const chatData = this.chatState.get(chatId);
      if (!chatData) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      const message = this.cleanObject({
        message_id: this.messageIdCounter++,
        date: this.timestamp(),
        chat: chatData.chat,
        from: this.botInfo,
        venue: {
          location: { latitude, longitude },
          title,
          address,
        },
      }) as Message;

      this.chatState.storeMessage(chatId, message);
      if (this.currentResponse) {
        this.currentResponse._addMessage(message);
      }
      return message;
    },

    sendContact: (payload) => {
      const chatId = payload.chat_id as number;
      const phoneNumber = payload.phone_number as string;
      const firstName = payload.first_name as string;
      const lastName = payload.last_name as string | undefined;

      const chatData = this.chatState.get(chatId);
      if (!chatData) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      const message = this.cleanObject({
        message_id: this.messageIdCounter++,
        date: this.timestamp(),
        chat: chatData.chat,
        from: this.botInfo,
        contact: {
          phone_number: phoneNumber,
          first_name: firstName,
          last_name: lastName,
        },
      }) as Message;

      this.chatState.storeMessage(chatId, message);
      if (this.currentResponse) {
        this.currentResponse._addMessage(message);
      }
      return message;
    },

    sendDice: (payload) => {
      const chatId = payload.chat_id as number;
      const emoji = (payload.emoji as string) || "🎲";

      const chatData = this.chatState.get(chatId);
      if (!chatData) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      // Generate random value based on emoji type
      const maxValues: Record<string, number> = {
        "🎲": 6, "🎯": 6, "🏀": 5, "⚽": 5, "🎰": 64, "🎳": 6,
      };
      const maxValue = maxValues[emoji] || 6;
      const value = Math.floor(Math.random() * maxValue) + 1;

      const message = this.cleanObject({
        message_id: this.messageIdCounter++,
        date: this.timestamp(),
        chat: chatData.chat,
        from: this.botInfo,
        dice: { emoji, value },
      }) as Message;

      this.chatState.storeMessage(chatId, message);
      if (this.currentResponse) {
        this.currentResponse._addMessage(message);
      }
      return message;
    },

    sendChatAction: (payload) => {
      const chatId = payload.chat_id as number;
      // const action = payload.action as string;

      if (!this.chatState.has(chatId)) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      // Chat actions don't produce messages, just return true
      return true;
    },

    sendMediaGroup: (payload) => {
      const chatId = payload.chat_id as number;
      const media = payload.media as Array<{ type: string; media: string; caption?: string }>;

      const chatData = this.chatState.get(chatId);
      if (!chatData) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      const messages: Message[] = [];
      const mediaGroupId = String(Date.now());

      for (const item of media) {
        const fileId = this.fileState.generateFileId(item.type);
        const fileUniqueId = this.fileState.generateFileUniqueId();

        const message = this.cleanObject({
          message_id: this.messageIdCounter++,
          date: this.timestamp(),
          chat: chatData.chat,
          from: this.botInfo,
          media_group_id: mediaGroupId,
          caption: item.caption,
          [item.type]: {
            file_id: fileId,
            file_unique_id: fileUniqueId,
          },
        }) as Message;

        this.chatState.storeMessage(chatId, message);
        if (this.currentResponse) {
          this.currentResponse._addMessage(message);
        }
        messages.push(message);
      }

      return messages;
    },

    // === Chat Management ===

    leaveChat: (payload) => {
      const chatId = payload.chat_id as number;

      if (!this.chatState.has(chatId)) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      // Remove bot from members
      this.memberState.leave(chatId, this.botInfo.id);
      return true;
    },

    setChatPhoto: (payload) => {
      const chatId = payload.chat_id as number;

      const chatData = this.chatState.get(chatId);
      if (!chatData) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      // Check bot has permission to change chat info
      this.requireBotPermission(chatId, "can_change_info", "change chat photo");

      // Store that a photo was set
      chatData.hasPhoto = true;
      return true;
    },

    deleteChatPhoto: (payload) => {
      const chatId = payload.chat_id as number;

      const chatData = this.chatState.get(chatId);
      if (!chatData) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      // Check bot has permission to change chat info
      this.requireBotPermission(chatId, "can_change_info", "delete chat photo");

      chatData.hasPhoto = false;
      return true;
    },

    setChatTitle: (payload) => {
      const chatId = payload.chat_id as number;
      const title = payload.title as string;

      const chatData = this.chatState.get(chatId);
      if (!chatData) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      if (chatData.chat.type === "private") {
        throw this.createApiError(400, "Bad Request: can't set title for private chat");
      }

      // Check bot has permission to change chat info
      this.requireBotPermission(chatId, "can_change_info", "change chat title");

      (chatData.chat as { title: string }).title = title;
      return true;
    },

    setChatDescription: (payload) => {
      const chatId = payload.chat_id as number;
      const description = payload.description as string;

      const chatData = this.chatState.get(chatId);
      if (!chatData) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      // Check bot has permission to change chat info
      this.requireBotPermission(chatId, "can_change_info", "change chat description");

      chatData.description = description;
      return true;
    },

    // === Bot Commands ===

    getMyCommands: () => {
      return this.botCommands;
    },

    setMyCommands: (payload) => {
      const commands = payload.commands as Array<{ command: string; description: string }>;
      this.botCommands = commands;
      return true;
    },

    deleteMyCommands: () => {
      this.botCommands = [];
      return true;
    },

    // === Menu Button ===

    setChatMenuButton: (payload) => {
      const chatId = payload.chat_id as number | undefined;
      const menuButton = payload.menu_button as { type: string } | undefined;

      if (chatId) {
        this.chatMenuButtons.set(chatId, menuButton || { type: "default" });
      } else {
        this.defaultMenuButton = menuButton || { type: "default" };
      }
      return true;
    },

    getChatMenuButton: (payload) => {
      const chatId = payload.chat_id as number | undefined;

      if (chatId && this.chatMenuButtons.has(chatId)) {
        return this.chatMenuButtons.get(chatId);
      }
      return this.defaultMenuButton;
    },

    // === Payments ===

    answerShippingQuery: (payload) => {
      const shippingQueryId = payload.shipping_query_id as string;
      const ok = payload.ok as boolean;
      const shippingOptions = payload.shipping_options as Array<{
        id: string;
        title: string;
        prices: Array<{ label: string; amount: number }>;
      }> | undefined;
      const errorMessage = payload.error_message as string | undefined;

      if (!ok && !errorMessage) {
        throw this.createApiError(400, "Bad Request: error_message is required when ok is false");
      }

      // Store the answer for verification in tests
      if (this.currentResponse) {
        (this.currentResponse as unknown as { shippingAnswer?: unknown }).shippingAnswer = {
          shippingQueryId,
          ok,
          shippingOptions,
          errorMessage,
        };
      }

      return true;
    },

    refundStarPayment: (payload) => {
      const userId = payload.user_id as number;
      const telegramPaymentChargeId = payload.telegram_payment_charge_id as string;

      // Just validate and return true - in tests, we verify the call was made
      if (!userId || !telegramPaymentChargeId) {
        throw this.createApiError(400, "Bad Request: missing required parameters");
      }

      return true;
    },

    // === Message Media Editing ===

    editMessageMedia: (payload) => {
      const chatId = payload.chat_id as number | undefined;
      const messageId = payload.message_id as number | undefined;
      const media = payload.media as { type: string; media: string; caption?: string };
      const replyMarkup = payload.reply_markup;

      if (chatId && messageId) {
        const message = this.chatState.getMessage(chatId, messageId);
        if (!message) {
          throw this.createApiError(400, "Bad Request: message not found");
        }

        // Generate new file data
        const fileId = this.fileState.generateFileId(media.type);
        const fileUniqueId = this.fileState.generateFileUniqueId();

        // Update media on the message
        const msgAny = message as unknown as Record<string, unknown>;
        msgAny[media.type] = { file_id: fileId, file_unique_id: fileUniqueId };
        if (media.caption !== undefined) {
          msgAny.caption = media.caption;
        }
        if (replyMarkup) {
          msgAny.reply_markup = replyMarkup;
        }

        if (this.currentResponse) {
          this.currentResponse._addEditedMessage(message);
        }

        return message;
      }

      return true;
    },

    // === Game ===

    sendGame: (payload) => {
      const chatId = payload.chat_id as number;
      const gameShortName = payload.game_short_name as string;

      const chatData = this.chatState.get(chatId);
      if (!chatData) {
        throw this.createApiError(400, "Bad Request: chat not found");
      }

      const message = this.cleanObject({
        message_id: this.messageIdCounter++,
        date: this.timestamp(),
        chat: chatData.chat,
        from: this.botInfo,
        game: {
          title: gameShortName,
          description: `Game: ${gameShortName}`,
          photo: [{
            file_id: this.fileState.generateFileId("photo"),
            file_unique_id: this.fileState.generateFileUniqueId(),
            width: 640,
            height: 480,
          }],
        },
      }) as unknown as Message;

      this.chatState.storeMessage(chatId, message);
      if (this.currentResponse) {
        this.currentResponse._addMessage(message);
      }
      return message;
    },
  };

  private handleSendMedia(
    payload: Record<string, unknown>,
    mediaType: string
  ): Message {
    const chatId = payload.chat_id as number;
    const caption = payload.caption as string | undefined;
    const parseMode = payload.parse_mode as ParseMode | undefined;
    const replyMarkup = payload.reply_markup;

    const chatData = this.chatState.get(chatId);
    if (!chatData) {
      throw this.createApiError(400, "Bad Request: chat not found");
    }

    // Check rate limits
    const rateCheck = this.memberState.checkRateLimit(
      chatId,
      this.botInfo.id,
      chatData.chat.type,
      this.chatState.getSlowModeDelay(chatId)
    );
    if (!rateCheck.allowed) {
      throw this.createApiError(429, "Too Many Requests: retry after " + rateCheck.retryAfter, {
        retry_after: rateCheck.retryAfter,
      });
    }

    let finalCaption = caption;
    let captionEntities: MessageEntity[] | undefined;

    if (parseMode && caption) {
      const parsed = parseFormattedText(caption, parseMode);
      finalCaption = parsed.text;
      captionEntities = parsed.entities.length > 0 ? parsed.entities : undefined;
    }

    // Generate file data based on media type
    let mediaData: Record<string, unknown>;
    const fileId = this.fileState.generateFileId(mediaType);
    const fileUniqueId = this.fileState.generateFileUniqueId();

    switch (mediaType) {
      case "photo":
        mediaData = {
          photo: [{
            file_id: fileId,
            file_unique_id: fileUniqueId,
            width: 800,
            height: 600,
          }],
        };
        break;
      case "document":
        mediaData = {
          document: {
            file_id: fileId,
            file_unique_id: fileUniqueId,
            file_name: "document.pdf",
          },
        };
        break;
      case "video":
        mediaData = {
          video: {
            file_id: fileId,
            file_unique_id: fileUniqueId,
            width: 1920,
            height: 1080,
            duration: 60,
          },
        };
        break;
      case "audio":
        mediaData = {
          audio: {
            file_id: fileId,
            file_unique_id: fileUniqueId,
            duration: 180,
          },
        };
        break;
      case "voice":
        mediaData = {
          voice: {
            file_id: fileId,
            file_unique_id: fileUniqueId,
            duration: 30,
          },
        };
        break;
      case "video_note":
        mediaData = {
          video_note: {
            file_id: fileId,
            file_unique_id: fileUniqueId,
            length: 240,
            duration: 15,
          },
        };
        break;
      case "sticker":
        mediaData = {
          sticker: {
            file_id: fileId,
            file_unique_id: fileUniqueId,
            type: "regular",
            width: 512,
            height: 512,
            is_animated: false,
            is_video: false,
          },
        };
        break;
      case "animation":
        mediaData = {
          animation: {
            file_id: fileId,
            file_unique_id: fileUniqueId,
            width: 320,
            height: 240,
            duration: 5,
          },
        };
        break;
      default:
        mediaData = {
          [mediaType]: { file_id: fileId, file_unique_id: fileUniqueId },
        };
    }

    const message = this.cleanObject({
      message_id: this.messageIdCounter++,
      date: this.timestamp(),
      chat: chatData.chat,
      from: this.botInfo,
      ...mediaData,
      caption: finalCaption,
      caption_entities: captionEntities,
      reply_markup: replyMarkup,
    }) as Message;

    this.chatState.storeMessage(chatId, message);

    if (this.currentResponse) {
      this.currentResponse._addMessage(message);
    }

    return message;
  }

  private createApiError(
    code: number,
    description: string,
    parameters?: { retry_after?: number; migrate_to_chat_id?: number }
  ): Error & { code: number; description: string; parameters?: typeof parameters } {
    const error = new Error(description) as Error & {
      code: number;
      description: string;
      parameters?: typeof parameters;
    };
    error.code = code;
    error.description = description;
    error.parameters = parameters;
    return error;
  }

  private cleanObject<T extends object>(obj: T): T {
    const cleaned = {} as T;
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        (cleaned as Record<string, unknown>)[key] = value;
      }
    }
    return cleaned;
  }
}
