import type {
  Update,
  Message,
  User,
  Chat,
  MessageEntity,
  CallbackQuery,
  InlineQuery,
  ChosenInlineResult,
  PreCheckoutQuery,
  PollAnswer,
  ChatMemberUpdated,
  ChatMember,
  Poll,
  PollOption,
  MessageReactionUpdated,
  ReactionType,
  PhotoSize,
  Document,
  Audio,
  Video,
  Voice,
  VideoNote,
  Sticker,
  Contact,
  Location,
  Venue,
  SuccessfulPayment,
  Invoice,
  ForumTopicCreated,
  ForumTopicClosed,
  ForumTopicReopened,
} from "grammy/types";
import { parseFormattedText, type ParseMode } from "./MarkdownParser.js";

/**
 * Counter state for generating unique IDs.
 */
export interface IdCounters {
  updateId: number;
  messageId: number;
  callbackQueryId: number;
  inlineQueryId: number;
  pollId: number;
  fileId: number;
}

/**
 * Creates a new set of ID counters.
 */
export function createIdCounters(): IdCounters {
  return {
    updateId: 1,
    messageId: 1,
    callbackQueryId: 1,
    inlineQueryId: 1,
    pollId: 1,
    fileId: 1,
  };
}

/**
 * Factory for creating realistic Telegram Update objects.
 *
 * All updates match Telegram's exact wire format, including:
 * - Proper ID sequencing
 * - Unix timestamps
 * - Entity formatting
 * - Removal of undefined fields
 */
export class UpdateFactory {
  private counters: IdCounters;

  constructor(counters?: IdCounters) {
    this.counters = counters ?? createIdCounters();
  }

  /**
   * Get the current counters (for inspection/testing).
   */
  getCounters(): IdCounters {
    return { ...this.counters };
  }

  /**
   * Reset counters to initial state.
   */
  reset(): void {
    this.counters = createIdCounters();
  }

  // === Text Messages ===

  /**
   * Create a text message update.
   */
  createTextMessage(
    user: User,
    chat: Chat,
    text: string,
    options: {
      parseMode?: ParseMode;
      entities?: MessageEntity[];
      replyToMessageId?: number;
      messageThreadId?: number;
    } = {}
  ): Update {
    let finalText = text;
    let entities = options.entities;

    if (options.parseMode && !entities) {
      const parsed = parseFormattedText(text, options.parseMode);
      finalText = parsed.text;
      entities = parsed.entities.length > 0 ? parsed.entities : undefined;
    }

    const message = this.cleanObject({
      message_id: this.counters.messageId++,
      date: this.timestamp(),
      chat,
      from: user,
      text: finalText,
      entities,
      reply_to_message: options.replyToMessageId
        ? { message_id: options.replyToMessageId }
        : undefined,
      message_thread_id: options.messageThreadId,
    }) as unknown as Message.TextMessage;

    return {
      update_id: this.counters.updateId++,
      message,
    } as Update;
  }

  /**
   * Create a command message update with bot_command entity.
   */
  createCommand(
    user: User,
    chat: Chat,
    command: string,
    args?: string,
    options: {
      replyToMessageId?: number;
      messageThreadId?: number;
    } = {}
  ): Update {
    const text = args ? `${command} ${args}` : command;
    const entities: MessageEntity[] = [
      {
        type: "bot_command",
        offset: 0,
        length: command.length,
      },
    ];

    const message = this.cleanObject({
      message_id: this.counters.messageId++,
      date: this.timestamp(),
      chat,
      from: user,
      text,
      entities,
      reply_to_message: options.replyToMessageId
        ? { message_id: options.replyToMessageId }
        : undefined,
      message_thread_id: options.messageThreadId,
    }) as unknown as Message.TextMessage;

    return {
      update_id: this.counters.updateId++,
      message,
    } as Update;
  }

  // === Callback Queries ===

  /**
   * Create a callback query update.
   */
  createCallbackQuery(
    user: User,
    chat: Chat,
    data: string,
    options: {
      fromMessage?: Message;
      inlineMessageId?: string;
    } = {}
  ): Update {
    const callbackQuery: CallbackQuery = this.cleanObject({
      id: String(this.counters.callbackQueryId++),
      from: user,
      chat_instance: String(chat.id),
      data,
      message: options.fromMessage,
      inline_message_id: options.inlineMessageId,
    });

    return {
      update_id: this.counters.updateId++,
      callback_query: callbackQuery,
    };
  }

  // === Inline Queries ===

  /**
   * Create an inline query update.
   */
  createInlineQuery(
    user: User,
    query: string,
    options: {
      offset?: string;
      chatType?: "sender" | "private" | "group" | "supergroup" | "channel";
      location?: Location;
    } = {}
  ): Update {
    const inlineQuery: InlineQuery = this.cleanObject({
      id: String(this.counters.inlineQueryId++),
      from: user,
      query,
      offset: options.offset ?? "",
      chat_type: options.chatType,
      location: options.location,
    });

    return {
      update_id: this.counters.updateId++,
      inline_query: inlineQuery,
    };
  }

  /**
   * Create a chosen inline result update.
   */
  createChosenInlineResult(
    user: User,
    resultId: string,
    query: string,
    options: {
      location?: Location;
      inlineMessageId?: string;
    } = {}
  ): Update {
    const chosenResult: ChosenInlineResult = this.cleanObject({
      result_id: resultId,
      from: user,
      query,
      location: options.location,
      inline_message_id: options.inlineMessageId,
    });

    return {
      update_id: this.counters.updateId++,
      chosen_inline_result: chosenResult,
    };
  }

  // === Media Messages ===

  /**
   * Create a photo message update.
   */
  createPhotoMessage(
    user: User,
    chat: Chat,
    photos: PhotoSize[],
    options: {
      caption?: string;
      parseMode?: ParseMode;
      captionEntities?: MessageEntity[];
      replyToMessageId?: number;
      messageThreadId?: number;
    } = {}
  ): Update {
    let caption = options.caption;
    let captionEntities = options.captionEntities;

    if (options.parseMode && caption && !captionEntities) {
      const parsed = parseFormattedText(caption, options.parseMode);
      caption = parsed.text;
      captionEntities = parsed.entities.length > 0 ? parsed.entities : undefined;
    }

    const message = this.cleanObject({
      message_id: this.counters.messageId++,
      date: this.timestamp(),
      chat,
      from: user,
      photo: photos,
      caption,
      caption_entities: captionEntities,
      reply_to_message: options.replyToMessageId
        ? { message_id: options.replyToMessageId }
        : undefined,
      message_thread_id: options.messageThreadId,
    }) as unknown as Message.PhotoMessage;

    return {
      update_id: this.counters.updateId++,
      message,
    } as Update;
  }

  /**
   * Create a document message update.
   */
  createDocumentMessage(
    user: User,
    chat: Chat,
    document: Document,
    options: {
      caption?: string;
      parseMode?: ParseMode;
      captionEntities?: MessageEntity[];
      replyToMessageId?: number;
      messageThreadId?: number;
    } = {}
  ): Update {
    let caption = options.caption;
    let captionEntities = options.captionEntities;

    if (options.parseMode && caption && !captionEntities) {
      const parsed = parseFormattedText(caption, options.parseMode);
      caption = parsed.text;
      captionEntities = parsed.entities.length > 0 ? parsed.entities : undefined;
    }

    const message = this.cleanObject({
      message_id: this.counters.messageId++,
      date: this.timestamp(),
      chat,
      from: user,
      document,
      caption,
      caption_entities: captionEntities,
      reply_to_message: options.replyToMessageId
        ? { message_id: options.replyToMessageId }
        : undefined,
      message_thread_id: options.messageThreadId,
    }) as unknown as Message.DocumentMessage;

    return {
      update_id: this.counters.updateId++,
      message,
    } as Update;
  }

  /**
   * Create an audio message update.
   */
  createAudioMessage(
    user: User,
    chat: Chat,
    audio: Audio,
    options: {
      caption?: string;
      parseMode?: ParseMode;
      captionEntities?: MessageEntity[];
      replyToMessageId?: number;
    } = {}
  ): Update {
    let caption = options.caption;
    let captionEntities = options.captionEntities;

    if (options.parseMode && caption && !captionEntities) {
      const parsed = parseFormattedText(caption, options.parseMode);
      caption = parsed.text;
      captionEntities = parsed.entities.length > 0 ? parsed.entities : undefined;
    }

    const message = this.cleanObject({
      message_id: this.counters.messageId++,
      date: this.timestamp(),
      chat,
      from: user,
      audio,
      caption,
      caption_entities: captionEntities,
      reply_to_message: options.replyToMessageId
        ? { message_id: options.replyToMessageId }
        : undefined,
    }) as unknown as Message.AudioMessage;

    return {
      update_id: this.counters.updateId++,
      message,
    } as Update;
  }

  /**
   * Create a video message update.
   */
  createVideoMessage(
    user: User,
    chat: Chat,
    video: Video,
    options: {
      caption?: string;
      parseMode?: ParseMode;
      captionEntities?: MessageEntity[];
      replyToMessageId?: number;
    } = {}
  ): Update {
    let caption = options.caption;
    let captionEntities = options.captionEntities;

    if (options.parseMode && caption && !captionEntities) {
      const parsed = parseFormattedText(caption, options.parseMode);
      caption = parsed.text;
      captionEntities = parsed.entities.length > 0 ? parsed.entities : undefined;
    }

    const message = this.cleanObject({
      message_id: this.counters.messageId++,
      date: this.timestamp(),
      chat,
      from: user,
      video,
      caption,
      caption_entities: captionEntities,
      reply_to_message: options.replyToMessageId
        ? { message_id: options.replyToMessageId }
        : undefined,
    }) as unknown as Message.VideoMessage;

    return {
      update_id: this.counters.updateId++,
      message,
    } as Update;
  }

  /**
   * Create a voice message update.
   */
  createVoiceMessage(
    user: User,
    chat: Chat,
    voice: Voice,
    options: {
      caption?: string;
      parseMode?: ParseMode;
      captionEntities?: MessageEntity[];
      replyToMessageId?: number;
    } = {}
  ): Update {
    const message = this.cleanObject({
      message_id: this.counters.messageId++,
      date: this.timestamp(),
      chat,
      from: user,
      voice,
      caption: options.caption,
      caption_entities: options.captionEntities,
      reply_to_message: options.replyToMessageId
        ? { message_id: options.replyToMessageId }
        : undefined,
    }) as unknown as Message.VoiceMessage;

    return {
      update_id: this.counters.updateId++,
      message,
    } as Update;
  }

  /**
   * Create a video note (round video) message update.
   */
  createVideoNoteMessage(
    user: User,
    chat: Chat,
    videoNote: VideoNote,
    options: {
      replyToMessageId?: number;
    } = {}
  ): Update {
    const message = this.cleanObject({
      message_id: this.counters.messageId++,
      date: this.timestamp(),
      chat,
      from: user,
      video_note: videoNote,
      reply_to_message: options.replyToMessageId
        ? { message_id: options.replyToMessageId }
        : undefined,
    }) as unknown as Message.VideoNoteMessage;

    return {
      update_id: this.counters.updateId++,
      message,
    } as Update;
  }

  /**
   * Create a sticker message update.
   */
  createStickerMessage(
    user: User,
    chat: Chat,
    sticker: Sticker,
    options: {
      replyToMessageId?: number;
    } = {}
  ): Update {
    const message = this.cleanObject({
      message_id: this.counters.messageId++,
      date: this.timestamp(),
      chat,
      from: user,
      sticker,
      reply_to_message: options.replyToMessageId
        ? { message_id: options.replyToMessageId }
        : undefined,
    }) as unknown as Message.StickerMessage;

    return {
      update_id: this.counters.updateId++,
      message,
    } as Update;
  }

  // === Contact, Location, Venue ===

  /**
   * Create a contact message update.
   */
  createContactMessage(
    user: User,
    chat: Chat,
    contact: Contact,
    options: { replyToMessageId?: number } = {}
  ): Update {
    const message = this.cleanObject({
      message_id: this.counters.messageId++,
      date: this.timestamp(),
      chat,
      from: user,
      contact,
      reply_to_message: options.replyToMessageId
        ? { message_id: options.replyToMessageId }
        : undefined,
    }) as unknown as Message.ContactMessage;

    return {
      update_id: this.counters.updateId++,
      message,
    } as Update;
  }

  /**
   * Create a location message update.
   */
  createLocationMessage(
    user: User,
    chat: Chat,
    location: Location,
    options: { replyToMessageId?: number } = {}
  ): Update {
    const message = this.cleanObject({
      message_id: this.counters.messageId++,
      date: this.timestamp(),
      chat,
      from: user,
      location,
      reply_to_message: options.replyToMessageId
        ? { message_id: options.replyToMessageId }
        : undefined,
    }) as unknown as Message.LocationMessage;

    return {
      update_id: this.counters.updateId++,
      message,
    } as Update;
  }

  /**
   * Create a venue message update.
   */
  createVenueMessage(
    user: User,
    chat: Chat,
    venue: Venue,
    options: { replyToMessageId?: number } = {}
  ): Update {
    const message = this.cleanObject({
      message_id: this.counters.messageId++,
      date: this.timestamp(),
      chat,
      from: user,
      venue,
      location: venue.location,
      reply_to_message: options.replyToMessageId
        ? { message_id: options.replyToMessageId }
        : undefined,
    }) as unknown as Message.VenueMessage;

    return {
      update_id: this.counters.updateId++,
      message,
    } as Update;
  }

  // === Polls ===

  /**
   * Create a poll message update.
   */
  createPollMessage(
    user: User,
    chat: Chat,
    poll: Poll,
    options: { replyToMessageId?: number } = {}
  ): Update {
    const message = this.cleanObject({
      message_id: this.counters.messageId++,
      date: this.timestamp(),
      chat,
      from: user,
      poll,
      reply_to_message: options.replyToMessageId
        ? { message_id: options.replyToMessageId }
        : undefined,
    }) as unknown as Message.PollMessage;

    return {
      update_id: this.counters.updateId++,
      message,
    } as Update;
  }

  /**
   * Create a poll answer update.
   */
  createPollAnswer(user: User, pollId: string, optionIds: number[]): Update {
    const pollAnswer: PollAnswer = {
      poll_id: pollId,
      user,
      option_ids: optionIds,
    };

    return {
      update_id: this.counters.updateId++,
      poll_answer: pollAnswer,
    };
  }

  /**
   * Helper to create a Poll object.
   */
  createPoll(
    question: string,
    options: string[],
    config: {
      type?: "regular" | "quiz";
      correctOptionId?: number;
      explanation?: string;
      isAnonymous?: boolean;
      allowsMultipleAnswers?: boolean;
      openPeriod?: number;
      closeDate?: number;
    } = {}
  ): Poll {
    const pollOptions: PollOption[] = options.map((text) => ({
      text,
      voter_count: 0,
    }));

    return this.cleanObject({
      id: String(this.counters.pollId++),
      question,
      options: pollOptions,
      total_voter_count: 0,
      is_closed: false,
      is_anonymous: config.isAnonymous ?? true,
      type: config.type ?? "regular",
      allows_multiple_answers: config.allowsMultipleAnswers ?? false,
      correct_option_id: config.correctOptionId,
      explanation: config.explanation,
      open_period: config.openPeriod,
      close_date: config.closeDate,
    });
  }

  // === Payments ===

  /**
   * Create a pre-checkout query update.
   */
  createPreCheckoutQuery(
    user: User,
    currency: string,
    totalAmount: number,
    invoicePayload: string,
    options: {
      shippingOptionId?: string;
      orderInfo?: {
        name?: string;
        phone_number?: string;
        email?: string;
        shipping_address?: {
          country_code: string;
          state: string;
          city: string;
          street_line1: string;
          street_line2: string;
          post_code: string;
        };
      };
    } = {}
  ): Update {
    const preCheckoutQuery: PreCheckoutQuery = this.cleanObject({
      id: String(this.counters.callbackQueryId++),
      from: user,
      currency,
      total_amount: totalAmount,
      invoice_payload: invoicePayload,
      shipping_option_id: options.shippingOptionId,
      order_info: options.orderInfo,
    });

    return {
      update_id: this.counters.updateId++,
      pre_checkout_query: preCheckoutQuery,
    };
  }

  /**
   * Create a successful payment message update.
   */
  createSuccessfulPayment(
    user: User,
    chat: Chat,
    payment: SuccessfulPayment
  ): Update {
    const message = this.cleanObject({
      message_id: this.counters.messageId++,
      date: this.timestamp(),
      chat,
      from: user,
      successful_payment: payment,
    }) as Message.SuccessfulPaymentMessage;

    return {
      update_id: this.counters.updateId++,
      message,
    } as Update;
  }

  /**
   * Create an invoice message update.
   */
  createInvoiceMessage(
    user: User,
    chat: Chat,
    invoice: Invoice
  ): Update {
    const message = this.cleanObject({
      message_id: this.counters.messageId++,
      date: this.timestamp(),
      chat,
      from: user,
      invoice,
    }) as Message.InvoiceMessage;

    return {
      update_id: this.counters.updateId++,
      message,
    } as Update;
  }

  // === Chat Member Updates ===

  /**
   * Create a chat member updated event (join, leave, promote, restrict, etc.).
   */
  createChatMemberUpdate(
    chat: Chat,
    from: User,
    oldMember: ChatMember,
    newMember: ChatMember,
    options: {
      inviteLink?: {
        invite_link: string;
        creator: User;
        creates_join_request: boolean;
        is_primary: boolean;
        is_revoked: boolean;
      };
      viaChatFolderInviteLink?: boolean;
    } = {}
  ): Update {
    const chatMemberUpdated: ChatMemberUpdated = this.cleanObject({
      chat,
      from,
      date: this.timestamp(),
      old_chat_member: oldMember,
      new_chat_member: newMember,
      invite_link: options.inviteLink,
      via_chat_folder_invite_link: options.viaChatFolderInviteLink,
    });

    return {
      update_id: this.counters.updateId++,
      chat_member: chatMemberUpdated,
    };
  }

  /**
   * Create a "my chat member" update (bot's membership status changed).
   */
  createMyChatMemberUpdate(
    chat: Chat,
    from: User,
    oldMember: ChatMember,
    newMember: ChatMember
  ): Update {
    const chatMemberUpdated: ChatMemberUpdated = {
      chat,
      from,
      date: this.timestamp(),
      old_chat_member: oldMember,
      new_chat_member: newMember,
    };

    return {
      update_id: this.counters.updateId++,
      my_chat_member: chatMemberUpdated,
    };
  }

  // === Reactions ===

  /**
   * Create a message reaction update.
   */
  createMessageReaction(
    chat: Chat,
    messageId: number,
    user: User,
    oldReaction: ReactionType[],
    newReaction: ReactionType[]
  ): Update {
    const messageReaction: MessageReactionUpdated = {
      chat,
      message_id: messageId,
      user,
      date: this.timestamp(),
      old_reaction: oldReaction,
      new_reaction: newReaction,
    };

    return {
      update_id: this.counters.updateId++,
      message_reaction: messageReaction,
    };
  }

  // === Forum Topics ===

  /**
   * Create a forum topic created message update.
   */
  createForumTopicCreated(
    user: User,
    chat: Chat,
    topicCreated: ForumTopicCreated,
    messageThreadId: number
  ): Update {
    const message = this.cleanObject({
      message_id: this.counters.messageId++,
      date: this.timestamp(),
      chat,
      from: user,
      message_thread_id: messageThreadId,
      forum_topic_created: topicCreated,
    }) as Message.ForumTopicCreatedMessage;

    return {
      update_id: this.counters.updateId++,
      message,
    } as Update;
  }

  /**
   * Create a forum topic closed message update.
   */
  createForumTopicClosed(
    user: User,
    chat: Chat,
    messageThreadId: number
  ): Update {
    const topicClosed: ForumTopicClosed = {};

    const message = this.cleanObject({
      message_id: this.counters.messageId++,
      date: this.timestamp(),
      chat,
      from: user,
      message_thread_id: messageThreadId,
      forum_topic_closed: topicClosed,
    }) as Message.ForumTopicClosedMessage;

    return {
      update_id: this.counters.updateId++,
      message,
    } as Update;
  }

  /**
   * Create a forum topic reopened message update.
   */
  createForumTopicReopened(
    user: User,
    chat: Chat,
    messageThreadId: number
  ): Update {
    const topicReopened: ForumTopicReopened = {};

    const message = this.cleanObject({
      message_id: this.counters.messageId++,
      date: this.timestamp(),
      chat,
      from: user,
      message_thread_id: messageThreadId,
      forum_topic_reopened: topicReopened,
    }) as Message.ForumTopicReopenedMessage;

    return {
      update_id: this.counters.updateId++,
      message,
    } as Update;
  }

  // === Edited Messages ===

  /**
   * Create an edited text message update (user edited their message).
   */
  createEditedTextMessage(
    user: User,
    chat: Chat,
    messageId: number,
    newText: string,
    options: {
      parseMode?: ParseMode;
      entities?: MessageEntity[];
    } = {}
  ): Update {
    let finalText = newText;
    let entities = options.entities;

    if (options.parseMode && !entities) {
      const parsed = parseFormattedText(newText, options.parseMode);
      finalText = parsed.text;
      entities = parsed.entities.length > 0 ? parsed.entities : undefined;
    }

    const message = this.cleanObject({
      message_id: messageId,
      date: this.timestamp() - 60, // Original message was sent before edit
      edit_date: this.timestamp(),
      chat,
      from: user,
      text: finalText,
      entities,
    }) as unknown as Message.TextMessage;

    return {
      update_id: this.counters.updateId++,
      edited_message: message,
    } as Update;
  }

  /**
   * Create an edited caption message update (user edited media caption).
   */
  createEditedCaptionMessage(
    user: User,
    chat: Chat,
    messageId: number,
    newCaption: string,
    options: {
      parseMode?: ParseMode;
      captionEntities?: MessageEntity[];
      photo?: PhotoSize[];
      document?: Document;
    } = {}
  ): Update {
    let caption = newCaption;
    let captionEntities = options.captionEntities;

    if (options.parseMode && !captionEntities) {
      const parsed = parseFormattedText(newCaption, options.parseMode);
      caption = parsed.text;
      captionEntities = parsed.entities.length > 0 ? parsed.entities : undefined;
    }

    const message = this.cleanObject({
      message_id: messageId,
      date: this.timestamp() - 60,
      edit_date: this.timestamp(),
      chat,
      from: user,
      caption,
      caption_entities: captionEntities,
      photo: options.photo,
      document: options.document,
    }) as unknown as Message;

    return {
      update_id: this.counters.updateId++,
      edited_message: message,
    } as Update;
  }

  // === Helper Methods ===

  /**
   * Generate a file ID.
   */
  generateFileId(prefix: string = "file"): string {
    return `${prefix}_${this.counters.fileId++}_${Date.now()}`;
  }

  /**
   * Create a PhotoSize array for photo messages.
   */
  createPhotoSizes(
    width: number,
    height: number,
    fileSize?: number
  ): PhotoSize[] {
    // Telegram typically provides multiple sizes
    const sizes: PhotoSize[] = [];

    // Thumbnail (90px on longest side)
    const thumbScale = 90 / Math.max(width, height);
    sizes.push({
      file_id: this.generateFileId("photo_thumb"),
      file_unique_id: this.generateFileId("unique"),
      width: Math.round(width * thumbScale),
      height: Math.round(height * thumbScale),
      file_size: fileSize ? Math.round(fileSize * thumbScale * thumbScale) : undefined,
    });

    // Medium (320px on longest side)
    const medScale = 320 / Math.max(width, height);
    if (medScale < 1) {
      sizes.push({
        file_id: this.generateFileId("photo_med"),
        file_unique_id: this.generateFileId("unique"),
        width: Math.round(width * medScale),
        height: Math.round(height * medScale),
        file_size: fileSize ? Math.round(fileSize * medScale * medScale) : undefined,
      });
    }

    // Original size
    sizes.push({
      file_id: this.generateFileId("photo"),
      file_unique_id: this.generateFileId("unique"),
      width,
      height,
      file_size: fileSize,
    });

    return sizes;
  }

  /**
   * Create a Document object.
   */
  createDocument(
    fileName: string,
    mimeType: string,
    fileSize?: number
  ): Document {
    return this.cleanObject({
      file_id: this.generateFileId("document"),
      file_unique_id: this.generateFileId("unique"),
      file_name: fileName,
      mime_type: mimeType,
      file_size: fileSize,
    });
  }

  /**
   * Create a Voice object.
   */
  createVoice(duration: number, mimeType?: string, fileSize?: number): Voice {
    return this.cleanObject({
      file_id: this.generateFileId("voice"),
      file_unique_id: this.generateFileId("unique"),
      duration,
      mime_type: mimeType,
      file_size: fileSize,
    });
  }

  /**
   * Create an Audio object.
   */
  createAudio(
    duration: number,
    options: {
      performer?: string;
      title?: string;
      fileName?: string;
      mimeType?: string;
      fileSize?: number;
    } = {}
  ): Audio {
    return this.cleanObject({
      file_id: this.generateFileId("audio"),
      file_unique_id: this.generateFileId("unique"),
      duration,
      performer: options.performer,
      title: options.title,
      file_name: options.fileName,
      mime_type: options.mimeType,
      file_size: options.fileSize,
    });
  }

  /**
   * Create a Video object.
   */
  createVideo(
    width: number,
    height: number,
    duration: number,
    options: {
      fileName?: string;
      mimeType?: string;
      fileSize?: number;
    } = {}
  ): Video {
    return this.cleanObject({
      file_id: this.generateFileId("video"),
      file_unique_id: this.generateFileId("unique"),
      width,
      height,
      duration,
      file_name: options.fileName,
      mime_type: options.mimeType,
      file_size: options.fileSize,
    });
  }

  /**
   * Get current Unix timestamp.
   */
  private timestamp(): number {
    return Math.floor(Date.now() / 1000);
  }

  /**
   * Remove undefined values from an object (Telegram doesn't send them).
   */
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

/**
 * Create a new UpdateFactory instance.
 */
export function createUpdateFactory(counters?: IdCounters): UpdateFactory {
  return new UpdateFactory(counters);
}
