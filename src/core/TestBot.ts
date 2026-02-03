import { Bot, type Context, type Api } from "grammy";
import type {
  Chat,
  Message,
  User,
  UserFromGetMe,
  Update,
  ChatAdministratorRights,
  ReactionType,
  ChatMember,
} from "grammy/types";
import { TelegramServer } from "./TelegramServer.js";
import { createTestTransformer, type ApiCallRecord } from "./TestClient.js";
import { FetchInterceptor } from "./FetchInterceptor.js";
import { createMockFetch } from "./MockFetch.js";
import { BotResponse, createBotResponse } from "./BotResponse.js";
import { UpdateQueue } from "./UpdateQueue.js";
import { WebhookSimulator, type WebhookAdapter, type WebhookOptions } from "./WebhookSimulator.js";
import { TestUpdateSource } from "./RunnerSupport.js";
import { WorkerSimulator } from "./WorkerSimulator.js";
import type { ParseMode } from "./MarkdownParser.js";
import type { StoredInviteLink } from "./ChatState.js";

const DEFAULT_BOT_INFO: UserFromGetMe = {
  id: 123456789,
  is_bot: true,
  first_name: "TestBot",
  username: "test_bot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: true,
  can_connect_to_business: false,
  has_main_web_app: false,
};

export interface TestBotConfig {
  /** Custom bot info */
  botInfo?: UserFromGetMe;
  /** Bot token (default: "TEST:TOKEN") */
  token?: string;
}

/**
 * Send message options.
 */
export interface SendMessageOptions {
  replyToMessageId?: number;
  parseMode?: ParseMode;
  messageThreadId?: number;
}

/**
 * Test harness for grammY bots.
 *
 * TestBot extends Bot directly (IS-A relationship), allowing it to be used
 * anywhere a Bot is expected. All handlers registered on TestBot work exactly
 * as they would on a real Bot.
 *
 * Key features:
 * - All Bot methods available directly
 * - Returns BotResponse from simulation methods
 * - Full Telegram API simulation via TelegramServer
 * - Polling simulation via UpdateQueue
 * - Webhook simulation for Express, Hono, Fastify, etc.
 * - Time simulation for testing restrictions/slow mode
 * - Role management (owner, admin, member)
 *
 * @example
 * ```typescript
 * const bot = new TestBot();
 * bot.command("start", ctx => ctx.reply("Welcome!"));
 *
 * const user = bot.createUser({ first_name: "Alice" });
 * const chat = bot.createChat({ type: "private" });
 *
 * const res = await bot.sendCommand(user, chat, "/start");
 * expect(res.text).toBe("Welcome!");
 * ```
 */
export class TestBot<C extends Context = Context> extends Bot<C> {
  readonly server: TelegramServer;
  readonly updateQueue: UpdateQueue;
  readonly webhookSimulator: WebhookSimulator;

  private apiCalls: ApiCallRecord[] = [];
  private userIdCounter = 1000;
  private chatIdCounter = 1000;
  private fetchInterceptor: FetchInterceptor;
  private _isPolling = false;
  private _testPollingAbortController: AbortController | null = null;

  constructor(config: TestBotConfig = {}) {
    const botInfo = config.botInfo ?? DEFAULT_BOT_INFO;
    const token = config.token ?? "TEST:TOKEN";

    // Create server first so we can reference it in the fetch function
    const server = new TelegramServer(botInfo);

    // Create the API call log
    const apiCalls: ApiCallRecord[] = [];

    // Create mock fetch that routes to our server
    const mockFetch = createMockFetch(server, apiCalls);

    // Call Bot constructor with mock fetch
    super(token, {
      botInfo,
      client: {
        baseFetchConfig: {
          // This is a workaround - we'll use transformer for the main interception
        },
      },
    });

    // Store references
    this.server = server;
    this.apiCalls = apiCalls;
    this.updateQueue = new UpdateQueue();
    this.webhookSimulator = new WebhookSimulator();

    // Set bot info to avoid initialization requirement
    this.botInfo = botInfo;

    // Inject mock fetch into bot's client config
    const botAny = this as unknown as { clientConfig: Record<string, unknown> };
    if (!botAny.clientConfig) {
      botAny.clientConfig = {};
    }
    botAny.clientConfig.fetch = mockFetch;

    // Also inject into existing bot.api.options
    if (!this.api.options) {
      (this.api as { options: unknown }).options = {};
    }
    (this.api.options as Record<string, unknown>).fetch = mockFetch;

    // Install transformer to intercept API calls on bot.api
    this.api.config.use(createTestTransformer(this.server, this.apiCalls));

    // Install fetch interceptor as a fallback for plugins
    this.fetchInterceptor = new FetchInterceptor(this.server, this.apiCalls);
    this.fetchInterceptor.install();
  }

  // === User and Chat Creation ===

  /**
   * Create a test user.
   */
  createUser(overrides: Partial<User> & { is_bot?: false } = {}): User {
    return {
      id: overrides.id ?? this.userIdCounter++,
      is_bot: false,
      first_name: overrides.first_name ?? "TestUser",
      ...overrides,
    };
  }

  /**
   * Create a test chat and register it with the server.
   */
  createChat(overrides: Partial<Chat> & { type?: Chat["type"] } = {}): Chat {
    const type = overrides.type ?? "private";
    const id = overrides.id ?? (type === "private" ? this.chatIdCounter++ : -this.chatIdCounter++);

    let chat: Chat;
    switch (type) {
      case "private":
        chat = {
          id,
          type: "private",
          first_name: (overrides as Partial<Chat.PrivateChat>).first_name ?? "TestUser",
          ...(overrides as Partial<Chat.PrivateChat>),
        } as Chat.PrivateChat;
        break;

      case "group":
        chat = {
          id,
          type: "group",
          title: (overrides as Partial<Chat.GroupChat>).title ?? "Test Group",
          ...(overrides as Partial<Chat.GroupChat>),
        } as Chat.GroupChat;
        break;

      case "supergroup":
        chat = {
          id,
          type: "supergroup",
          title: (overrides as Partial<Chat.SupergroupChat>).title ?? "Test Supergroup",
          ...(overrides as Partial<Chat.SupergroupChat>),
        } as Chat.SupergroupChat;
        break;

      case "channel":
        chat = {
          id,
          type: "channel",
          title: (overrides as Partial<Chat.ChannelChat>).title ?? "Test Channel",
          ...(overrides as Partial<Chat.ChannelChat>),
        } as Chat.ChannelChat;
        break;

      default:
        throw new Error(`Unknown chat type: ${type}`);
    }

    // Register the chat with the server
    this.server.chatState.getOrCreate(chat);

    // Enable forum if is_forum is true
    if ((overrides as { is_forum?: boolean }).is_forum && type === "supergroup") {
      this.server.chatState.enableForum(id);
    }

    return chat;
  }

  // === Simulate User Actions (Return BotResponse) ===

  /**
   * Simulate a user sending a text message.
   * Returns a BotResponse containing all bot actions.
   */
  async sendMessage(
    user: User,
    chat: Chat,
    text: string,
    options: SendMessageOptions = {}
  ): Promise<BotResponse> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    try {
      const update = this.server.simulateUserMessage(user, chat, text, {
        parseMode: options.parseMode,
        replyToMessageId: options.replyToMessageId,
        messageThreadId: options.messageThreadId,
      });
      // Store the user's sent message for test access
      if (update.message) {
        response.sentMessage = update.message;
      }
      await this.handleUpdate(update);
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  /**
   * Simulate a user sending a command.
   * Returns a BotResponse containing all bot actions.
   *
   * Can be called in two ways:
   * - sendCommand(user, chat, "/echo Hello World") - full command string
   * - sendCommand(user, chat, "/echo", "Hello World") - separate command and args
   *
   * The first style matches how users type in Telegram.
   */
  async sendCommand(
    user: User,
    chat: Chat,
    commandOrText: string,
    argsOrOptions?: string | SendMessageOptions,
    options: SendMessageOptions = {}
  ): Promise<BotResponse> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    // Parse command and args from the input
    let command: string;
    let args: string | undefined;
    let opts: SendMessageOptions;

    if (typeof argsOrOptions === "string") {
      // Called as sendCommand(user, chat, command, args, options?)
      command = commandOrText;
      args = argsOrOptions;
      opts = options;
    } else if (typeof argsOrOptions === "object") {
      // Called as sendCommand(user, chat, "/command args", options)
      opts = argsOrOptions;
      // Parse command and args from the text
      const firstSpace = commandOrText.indexOf(" ");
      if (firstSpace > 0) {
        command = commandOrText.substring(0, firstSpace);
        args = commandOrText.substring(firstSpace + 1);
      } else {
        command = commandOrText;
        args = undefined;
      }
    } else {
      // Called as sendCommand(user, chat, "/command args")
      opts = options;
      const firstSpace = commandOrText.indexOf(" ");
      if (firstSpace > 0) {
        command = commandOrText.substring(0, firstSpace);
        args = commandOrText.substring(firstSpace + 1);
      } else {
        command = commandOrText;
        args = undefined;
      }
    }

    try {
      const update = this.server.simulateUserCommand(user, chat, command, args, {
        replyToMessageId: opts.replyToMessageId,
        messageThreadId: opts.messageThreadId,
      });
      // Store the user's sent message for test access
      if (update.message) {
        response.sentMessage = update.message;
      }
      await this.handleUpdate(update);
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  /**
   * Simulate a user clicking an inline keyboard button.
   * Returns a BotResponse containing all bot actions.
   */
  async clickButton(
    user: User,
    chat: Chat,
    callbackData: string,
    fromMessage?: Message
  ): Promise<BotResponse> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    try {
      const update = this.server.simulateCallbackQuery(user, chat, callbackData, fromMessage);
      await this.handleUpdate(update);
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  /**
   * Simulate a user editing their message.
   * Returns a BotResponse containing all bot actions in response to the edit.
   *
   * @example
   * ```typescript
   * // User sends a message
   * const response = await testBot.sendMessage(user, chat, "Hello");
   * const messageId = response.messages[0].message_id;
   *
   * // User edits their message
   * const editResponse = await testBot.editUserMessage(user, chat, messageId, "Hello, world!");
   * expect(editResponse.text).toBe("Message updated!");
   * ```
   */
  async editUserMessage(
    user: User,
    chat: Chat,
    messageId: number,
    newText: string,
    options: {
      parseMode?: "Markdown" | "MarkdownV2" | "HTML";
    } = {}
  ): Promise<BotResponse> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    try {
      const update = this.server.updateFactory.createEditedTextMessage(
        user,
        chat,
        messageId,
        newText,
        { parseMode: options.parseMode }
      );
      await this.handleUpdate(update);
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  /**
   * Simulate an inline query from a user.
   * Returns a BotResponse containing the inline results.
   */
  async sendInlineQuery(
    user: User,
    query: string,
    options: { offset?: string; chatType?: "sender" | "private" | "group" | "supergroup" | "channel" } = {}
  ): Promise<BotResponse> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    try {
      const update = this.server.simulateInlineQuery(user, query, options);
      await this.handleUpdate(update);
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  /**
   * Simulate a user choosing an inline result.
   *
   * @param user The user choosing the result
   * @param resultId The ID of the chosen result
   * @param query The query that was used (optional)
   */
  async chooseInlineResult(
    user: User,
    resultId: string,
    query: string = ""
  ): Promise<BotResponse> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    try {
      const update = this.server.updateFactory.createChosenInlineResult(
        user,
        resultId,
        query
      );
      await this.handleUpdate(update);
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  /**
   * Simulate a user sending a photo.
   */
  async sendPhoto(
    user: User,
    chat: Chat,
    photo: { width: number; height: number; content?: Buffer | Uint8Array; fileSize?: number },
    options: { caption?: string; parseMode?: ParseMode; replyToMessageId?: number } = {}
  ): Promise<BotResponse> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    try {
      const update = this.server.simulatePhotoMessage(user, chat, photo.width, photo.height, {
        content: photo.content,
        fileSize: photo.fileSize,
        caption: options.caption,
        parseMode: options.parseMode,
        replyToMessageId: options.replyToMessageId,
      });
      if (update.message) {
        response.sentMessage = update.message;
      }
      await this.handleUpdate(update);
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  /**
   * Simulate a user sending a document.
   */
  async sendDocument(
    user: User,
    chat: Chat,
    document: { fileName: string; mimeType: string; content?: Buffer | Uint8Array; fileSize?: number },
    options: { caption?: string; parseMode?: ParseMode; replyToMessageId?: number } = {}
  ): Promise<BotResponse> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    try {
      const update = this.server.simulateDocumentMessage(user, chat, document.fileName, document.mimeType, {
        content: document.content,
        fileSize: document.fileSize,
        caption: options.caption,
        parseMode: options.parseMode,
        replyToMessageId: options.replyToMessageId,
      });
      if (update.message) {
        response.sentMessage = update.message;
      }
      await this.handleUpdate(update);
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  /**
   * Simulate a user voting on a poll.
   * @param user The user voting
   * @param pollOrId The poll object or poll ID string
   * @param optionIds Array of option indices to vote for
   */
  async vote(
    user: User,
    pollOrId: { id: string } | string,
    optionIds: number[]
  ): Promise<BotResponse> {
    const pollId = typeof pollOrId === "string" ? pollOrId : pollOrId.id;
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    try {
      const update = this.server.simulatePollAnswer(user, pollId, optionIds);
      await this.handleUpdate(update);
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  /**
   * Simulate a user reacting to a message.
   * @param user The user reacting
   * @param chat The chat where the message is
   * @param messageId The message ID to react to
   * @param reactions The reactions to set
   */
  async react(
    user: User,
    chat: Chat,
    messageId: number,
    reactions: ReactionType[]
  ): Promise<BotResponse> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    try {
      const update = this.server.simulateMessageReaction(user, chat, messageId, reactions);
      await this.handleUpdate(update);
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  /**
   * Simulate a user sending an audio file.
   */
  async sendAudio(
    user: User,
    chat: Chat,
    audio: { duration: number; title?: string; performer?: string },
    options: { caption?: string; replyToMessageId?: number } = {}
  ): Promise<BotResponse> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    try {
      const update = this.server.simulateAudioMessage(user, chat, audio.duration, {
        title: audio.title,
        performer: audio.performer,
        caption: options.caption,
        replyToMessageId: options.replyToMessageId,
      });
      if (update.message) {
        response.sentMessage = update.message;
      }
      await this.handleUpdate(update);
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  /**
   * Simulate a user sending a video.
   */
  async sendVideo(
    user: User,
    chat: Chat,
    video: { width: number; height: number; duration: number },
    options: { caption?: string; replyToMessageId?: number } = {}
  ): Promise<BotResponse> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    try {
      const update = this.server.simulateVideoMessage(user, chat, video.width, video.height, video.duration, {
        caption: options.caption,
        replyToMessageId: options.replyToMessageId,
      });
      if (update.message) {
        response.sentMessage = update.message;
      }
      await this.handleUpdate(update);
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  /**
   * Simulate a user sending a voice message.
   */
  async sendVoice(
    user: User,
    chat: Chat,
    voice: { duration: number },
    options: { caption?: string; replyToMessageId?: number } = {}
  ): Promise<BotResponse> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    try {
      const update = this.server.simulateVoiceMessage(user, chat, voice.duration, {
        caption: options.caption,
        replyToMessageId: options.replyToMessageId,
      });
      if (update.message) {
        response.sentMessage = update.message;
      }
      await this.handleUpdate(update);
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  /**
   * Simulate a user sending a sticker.
   */
  async sendSticker(
    user: User,
    chat: Chat,
    sticker: { emoji?: string; setName?: string }
  ): Promise<BotResponse> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    try {
      const update = this.server.simulateStickerMessage(user, chat, {
        emoji: sticker.emoji,
        setName: sticker.setName,
      });
      if (update.message) {
        response.sentMessage = update.message;
      }
      await this.handleUpdate(update);
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  /**
   * Simulate a user sending a contact.
   */
  async sendContact(
    user: User,
    chat: Chat,
    contact: { phoneNumber: string; firstName: string; lastName?: string }
  ): Promise<BotResponse> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    try {
      const update = this.server.simulateContactMessage(user, chat, {
        phoneNumber: contact.phoneNumber,
        firstName: contact.firstName,
        lastName: contact.lastName,
      });
      if (update.message) {
        response.sentMessage = update.message;
      }
      await this.handleUpdate(update);
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  /**
   * Simulate a user sending a location.
   */
  async sendLocation(
    user: User,
    chat: Chat,
    location: { latitude: number; longitude: number }
  ): Promise<BotResponse> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    try {
      const update = this.server.simulateLocationMessage(user, chat, location.latitude, location.longitude);
      if (update.message) {
        response.sentMessage = update.message;
      }
      await this.handleUpdate(update);
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  /**
   * Simulate a user sending a venue.
   */
  async sendVenue(
    user: User,
    chat: Chat,
    venue: { latitude: number; longitude: number; title: string; address: string }
  ): Promise<BotResponse> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    try {
      const update = this.server.simulateVenueMessage(user, chat, {
        latitude: venue.latitude,
        longitude: venue.longitude,
        title: venue.title,
        address: venue.address,
      });
      if (update.message) {
        response.sentMessage = update.message;
      }
      await this.handleUpdate(update);
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  /**
   * Simulate a pre-checkout query from Telegram Payments.
   */
  async simulatePreCheckout(
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
  ): Promise<BotResponse> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    try {
      const update = this.server.simulatePreCheckoutQuery(user, query);
      await this.handleUpdate(update);
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  /**
   * Simulate a successful payment message.
   */
  async simulateSuccessfulPayment(
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
  ): Promise<BotResponse> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    try {
      const update = this.server.simulateSuccessfulPayment(user, chat, payment);
      await this.handleUpdate(update);
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  /**
   * Simulate a shipping query from Telegram Payments.
   */
  async simulateShippingQuery(
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
  ): Promise<BotResponse> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    try {
      const update = this.server.simulateShippingQuery(user, query);
      await this.handleUpdate(update);
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  /**
   * Simulate a reaction count update (for anonymous reactions in channels).
   */
  async simulateReactionCountUpdate(
    chat: Chat,
    messageId: number,
    reactions: Array<{
      type: ReactionType;
      total_count: number;
    }>
  ): Promise<BotResponse> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    try {
      const update = this.server.simulateReactionCountUpdate(chat, messageId, reactions);
      await this.handleUpdate(update);
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  /**
   * Simulate an anonymous reaction (without user info).
   */
  async simulateAnonymousReaction(
    chat: Chat,
    messageId: number,
    newReactions: ReactionType[],
    oldReactions: ReactionType[]
  ): Promise<BotResponse> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    try {
      const update = this.server.simulateAnonymousReaction(chat, messageId, newReactions, oldReactions);
      await this.handleUpdate(update);
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  /**
   * Simulate a user joining via an invite link.
   */
  async simulateJoinViaLink(
    user: User,
    chat: Chat,
    inviteLink: string
  ): Promise<BotResponse> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    try {
      // Check if user is banned from this chat
      const existingMember = this.server.memberState.getMember(chat.id, user.id);
      if (existingMember?.status === "kicked") {
        response._setError({ code: 400, description: "Bad Request: user is banned from the chat" });
        return response;
      }

      // Check if link is valid
      if (!this.server.chatState.isInviteLinkValid(chat.id, inviteLink)) {
        const link = this.server.chatState.getInviteLink(chat.id, inviteLink);
        if (link?.is_revoked) {
          response._setError({ code: 400, description: "Bad Request: invite link revoked" });
        } else if (link?.member_limit && link.usage_count >= link.member_limit) {
          response._setError({ code: 400, description: "Bad Request: invite link member limit reached" });
        } else {
          response._setError({ code: 400, description: "Bad Request: invite link expired or invalid" });
        }
        return response;
      }

      const link = this.server.chatState.getInviteLink(chat.id, inviteLink);
      if (!link) {
        response._setError({ code: 400, description: "Bad Request: invite link not found" });
        return response;
      }

      // If link creates join request, add to pending
      if (link.creates_join_request) {
        this.server.chatState.addJoinRequest(chat.id, inviteLink, user);
        const update = {
          update_id: this.server["updateIdCounter"]++,
          chat_join_request: {
            chat: this.server.chatState.get(chat.id)!.chat,
            from: user,
            user_chat_id: user.id,
            date: Math.floor(Date.now() / 1000),
            invite_link: link,
          },
        } as Update;
        await this.handleUpdate(update);
      } else {
        // User joins directly
        this.server.chatState.useInviteLink(chat.id, inviteLink, user.id);
        const previousMember = this.server.memberState.getMember(chat.id, user.id);
        const oldStatus = previousMember?.status ?? "left";
        this.server.memberState.setMember(chat.id, user, "member");

        // Send chat_member update
        const update: Update = {
          update_id: this.server["updateIdCounter"]++,
          chat_member: {
            chat: this.server.chatState.get(chat.id)!.chat,
            from: user,
            date: Math.floor(Date.now() / 1000),
            old_chat_member: {
              status: oldStatus,
              user,
            } as ChatMember,
            new_chat_member: {
              status: "member",
              user,
            } as ChatMember,
            invite_link: link,
          },
        };
        await this.handleUpdate(update);
      }
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  /**
   * Simulate a user requesting to join via an invite link.
   */
  async simulateJoinRequest(
    user: User,
    chat: Chat,
    inviteLink: string
  ): Promise<BotResponse> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    try {
      const link = this.server.chatState.getInviteLink(chat.id, inviteLink);
      if (!link) {
        response._setError({ code: 400, description: "Bad Request: invite link not found" });
        return response;
      }

      this.server.chatState.addJoinRequest(chat.id, inviteLink, user);

      const update = {
        update_id: this.server["updateIdCounter"]++,
        chat_join_request: {
          chat: this.server.chatState.get(chat.id)!.chat,
          from: user,
          user_chat_id: user.id,
          date: Math.floor(Date.now() / 1000),
          invite_link: link,
        },
      } as Update;
      await this.handleUpdate(update);
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  // === Role Management ===

  /**
   * Set a user as the chat owner (creator).
   */
  setOwner(
    chat: Chat,
    user: User,
    options: { customTitle?: string; isAnonymous?: boolean } = {}
  ): void {
    this.server.chatState.getOrCreate(chat);
    this.server.memberState.setOwner(chat.id, user, options);
  }

  /**
   * Set a user as an administrator.
   */
  setAdmin(
    chat: Chat,
    user: User,
    rights: Partial<ChatAdministratorRights>,
    options: { customTitle?: string; isAnonymous?: boolean } = {}
  ): void {
    this.server.chatState.getOrCreate(chat);
    this.server.memberState.setAdmin(chat.id, user, rights, options);
  }

  /**
   * Set a user as a regular member.
   */
  setMember(chat: Chat, user: User): void {
    this.server.chatState.getOrCreate(chat);
    this.server.memberState.setMember(chat.id, user, "member");
  }

  /**
   * Set the bot as an administrator in a chat.
   * This is required for the bot to perform admin operations like ban, restrict, etc.
   * In real Telegram, the bot must be promoted to admin with the required permissions.
   *
   * @example
   * ```typescript
   * testBot.setBotAdmin(group, { can_restrict_members: true, can_delete_messages: true });
   * ```
   */
  setBotAdmin(chat: Chat, rights: Partial<ChatAdministratorRights> = {}): void {
    this.server.chatState.getOrCreate(chat);
    const botUser: User = {
      id: this.botInfo.id,
      is_bot: true,
      first_name: this.botInfo.first_name,
      username: this.botInfo.username,
    };
    this.server.memberState.setAdmin(chat.id, botUser, rights);
  }

  /**
   * Set the bot as a regular member (not admin) in a chat.
   * By default, the bot is not a member of any chat until explicitly added.
   */
  setBotMember(chat: Chat): void {
    this.server.chatState.getOrCreate(chat);
    const botUser: User = {
      id: this.botInfo.id,
      is_bot: true,
      first_name: this.botInfo.first_name,
      username: this.botInfo.username,
    };
    this.server.memberState.setMember(chat.id, botUser, "member");
  }

  // === Time Simulation ===

  /**
   * Advance simulated time by seconds.
   * Useful for testing time-based features like slow mode.
   */
  advanceTime(seconds: number): void {
    this.server.advanceTime(seconds);
  }

  // === Polling Simulation ===

  /**
   * Queue an update for processing by start().
   */
  queueUpdate(update: Update): void {
    this.updateQueue.push(update);
  }

  /**
   * Queue multiple updates.
   */
  queueUpdates(updates: Update[]): void {
    this.updateQueue.pushBatch(updates);
  }

  /**
   * Start polling simulation.
   * Processes queued updates and waits for new ones.
   *
   * Note: This overrides Bot.start() to provide test-specific behavior.
   * Unlike real polling, it processes updates from the UpdateQueue.
   */
  override async start(options?: { drop_pending_updates?: boolean }): Promise<void> {
    if (this._isPolling) {
      throw new Error("Bot is already polling");
    }

    this._isPolling = true;
    this._testPollingAbortController = new AbortController();
    this.updateQueue.resume();

    // Process updates from the queue
    while (this._isPolling && !this._testPollingAbortController.signal.aborted) {
      const updates = await this.updateQueue.getUpdates(0, 100, 1);

      for (const update of updates) {
        if (!this._isPolling) break;
        await this.handleUpdate(update);
      }

      // If no updates and queue is aborted, exit
      if (this.updateQueue.isAborted) break;
    }
  }

  /**
   * Stop polling simulation.
   */
  override async stop(): Promise<void> {
    this._isPolling = false;
    this.updateQueue.abort();
    if (this._testPollingAbortController) {
      this._testPollingAbortController.abort();
      this._testPollingAbortController = null;
    }
  }

  // === Webhook Simulation ===

  /**
   * Simulate a webhook request.
   * Returns a BotResponse capturing what the bot did in response.
   */
  async simulateWebhook(
    adapter: WebhookAdapter,
    update: Update,
    options: WebhookOptions = {}
  ): Promise<BotResponse> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    try {
      await this.handleUpdate(update);
    } finally {
      this.server.setCurrentResponse(null);
    }

    return response;
  }

  /**
   * Simulate a webhook request and get raw HTTP response details.
   * Useful for testing webhook callback behavior.
   */
  async simulateWebhookRaw(
    adapter: WebhookAdapter,
    update: Update,
    options: WebhookOptions = {}
  ): Promise<{ statusCode: number; headers: Record<string, string>; body: string | Buffer | null }> {
    const response = createBotResponse();
    this.server.setCurrentResponse(response);

    // For Express-style adapters
    if (adapter === "express") {
      const { req, res } = this.webhookSimulator.createExpressRequest(update, options);
      await this.handleUpdate(update);
      this.server.setCurrentResponse(null);
      return {
        statusCode: res.statusCode,
        headers: Object.fromEntries(res.headers),
        body: res.body,
      };
    }

    // Default: just process the update
    await this.handleUpdate(update);
    this.server.setCurrentResponse(null);
    return { statusCode: 200, headers: {}, body: null };
  }

  // === Conversation Helper ===

  /**
   * Create a conversation tester for this user and chat.
   */
  conversation(user: User, chat: Chat): ConversationHelper<C> {
    return new ConversationHelper(this, user, chat);
  }

  // === Inspect Bot Responses ===

  /**
   * Get all API calls made by the bot.
   */
  getApiCalls(): ApiCallRecord[] {
    return [...this.apiCalls];
  }


  // === Runner Support ===

  /**
   * Create an update source for use with grammY runner.
   *
   * This allows testing bots that use `run(bot)` from @grammyjs/runner
   * for concurrent update processing.
   *
   * @example
   * ```typescript
   * import { run } from "@grammyjs/runner";
   *
   * const source = testBot.createRunnerSource();
   * const handle = run(testBot, { source });
   *
   * const user = testBot.createUser({ first_name: "Alice" });
   * const chat = testBot.createChat({ type: "private" });
   *
   * // Queue updates
   * source.push(testBot.server.updateFactory.createTextMessage(user, chat, "hello"));
   * source.push(testBot.server.updateFactory.createTextMessage(user, chat, "world"));
   *
   * // Wait for processing
   * await source.waitForProcessing();
   *
   * // Check results using server state
   * const messages = testBot.server.getAllMessages(chat.id);
   * expect(messages.length).toBeGreaterThan(0);
   *
   * // Stop the runner
   * await handle.stop();
   * ```
   */
  createRunnerSource(): TestUpdateSource {
    return new TestUpdateSource();
  }

  /**
   * Run multiple updates concurrently and collect all responses.
   * Useful for testing concurrent update handling without the full runner setup.
   *
   * @param updates Array of updates to process concurrently
   * @returns Array of BotResponse objects, one per update
   */
  async processUpdatesConcurrently(updates: Update[]): Promise<BotResponse[]> {
    const responses: BotResponse[] = [];

    // Process updates sequentially to ensure correct response tracking
    // Each update gets its own BotResponse object
    for (const update of updates) {
      const response = createBotResponse();
      this.server.setCurrentResponse(response);
      try {
        await this.handleUpdate(update);
      } finally {
        this.server.setCurrentResponse(null);
      }
      responses.push(response);
    }

    return responses;
  }

  // === Worker/Queue Simulation ===

  /**
   * Create a worker simulator for testing bots that delegate to message queues.
   *
   * This is useful for testing patterns where:
   * 1. Bot handler receives an update and queues a job
   * 2. A separate worker processes the job
   * 3. Worker sends the response through the API
   *
   * @example
   * ```typescript
   * // In your bot (real code)
   * bot.on("message:text", async (ctx) => {
   *   await queue.publish({ chatId: ctx.chat.id, text: ctx.message.text });
   *   // Don't respond here - worker will respond
   * });
   *
   * // In your test
   * const worker = testBot.createWorkerSimulator();
   *
   * // Send message (handler queues job, doesn't respond)
   * await testBot.sendMessage(user, chat, "heavy task");
   *
   * // Simulate worker processing and responding
   * const response = await worker.sendMessage(chat.id, "Task completed!");
   * expect(response.text).toBe("Task completed!");
   *
   * // Or use processJob for more control
   * const response = await worker.processJob(chat.id, async (api) => {
   *   const result = await someHeavyProcessing();
   *   await api.sendMessage(chat.id, `Result: ${result}`);
   * });
   * ```
   */
  createWorkerSimulator(): WorkerSimulator {
    return new WorkerSimulator(this.server, this.api);
  }

  // === State Management ===

  /**
   * Reset all state - clears the server, API call log, and counters.
   */
  clear(): void {
    this.server.reset();
    this.apiCalls.length = 0;
    this.updateQueue.reset();
  }

  /**
   * Clean up resources. Call this in afterEach/afterAll to restore global fetch.
   */
  dispose(): void {
    this.fetchInterceptor.uninstall();
  }
}

/**
 * Helper class for testing multi-step conversations.
 */
class ConversationHelper<C extends Context> {
  private testBot: TestBot<C>;
  private user: User;
  private chat: Chat;

  constructor(testBot: TestBot<C>, user: User, chat: Chat) {
    this.testBot = testBot;
    this.user = user;
    this.chat = chat;
  }

  /**
   * Start a conversation with a command.
   */
  async start(command: string, args?: string): Promise<BotResponse> {
    return this.testBot.sendCommand(this.user, this.chat, command, args);
  }

  /**
   * Send a message in the conversation.
   */
  async say(text: string, options?: SendMessageOptions): Promise<BotResponse> {
    return this.testBot.sendMessage(this.user, this.chat, text, options);
  }

  /**
   * Click a button in the conversation.
   */
  async click(callbackData: string, fromMessage?: Message): Promise<BotResponse> {
    return this.testBot.clickButton(this.user, this.chat, callbackData, fromMessage);
  }

  /**
   * Send a command during the conversation.
   */
  async command(cmd: string, args?: string): Promise<BotResponse> {
    return this.testBot.sendCommand(this.user, this.chat, cmd, args);
  }
}

/**
 * Create a test harness for a grammY bot.
 *
 * This function wraps an existing Bot instance for testing.
 * For new projects, prefer using `new TestBot()` directly.
 *
 * @example
 * ```typescript
 * // Pattern 1: TestBot directly (recommended)
 * const testBot = new TestBot();
 * testBot.command("start", ctx => ctx.reply("Welcome!"));
 *
 * // Pattern 2: Wrap existing bot (backwards compatible)
 * const existingBot = new Bot(process.env.BOT_TOKEN!);
 * existingBot.command("start", ctx => ctx.reply("Hi"));
 * const testBot = createTestBot(existingBot);
 * ```
 */
export function createTestBot<C extends Context = Context>(
  bot: Bot<C>,
  config: TestBotConfig = {}
): TestBot<C> {
  const testBot = new TestBot<C>(config);

  // Copy middleware from the existing bot by accessing internal handler
  const botAny = bot as unknown as { handler?: { middleware?: unknown } };
  const testBotAny = testBot as unknown as { handler?: { middleware?: unknown } };

  // Access grammY's internal middleware composer
  // For complex bots, use the handler factory pattern instead
  if (botAny.handler) {
    testBotAny.handler = botAny.handler;
  }

  // Safely copy bot info (only if bot has been initialized)
  // If not initialized, use default
  try {
    // Check if botInfo is available without throwing
    const existingBotInfo = (bot as unknown as { me?: UserFromGetMe }).me;
    if (existingBotInfo) {
      testBot.botInfo = existingBotInfo;
    }
  } catch {
    // Bot not initialized, use config or default (already set in TestBot constructor)
  }

  return testBot;
}

export { type BotResponse } from "./BotResponse.js";
