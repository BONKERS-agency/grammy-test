import type {
  ChatInviteLink,
  InlineKeyboardButton,
  InlineQueryResult,
  Invoice,
  KeyboardButton,
  Message,
  MessageEntity,
  Poll,
} from "grammy/types";
import type { ApiCallRecord } from "./TestClient.js";

/**
 * Error response from the Telegram API.
 */
export interface TelegramError {
  code: number;
  description: string;
  parameters?: {
    retry_after?: number;
    migrate_to_chat_id?: number;
  };
}

/**
 * Represents the bot's response to a simulated user action.
 *
 * This object captures everything the bot did in response to an update:
 * messages sent, edits made, keyboards shown, callback answers, etc.
 */
export class BotResponse {
  /** The message that was sent by the user (simulated input) */
  sentMessage?: Message;

  /** Messages sent by the bot */
  readonly messages: Message[] = [];

  /** Messages edited by the bot */
  readonly editedMessages: Message[] = [];

  /** Messages deleted by the bot (message IDs) */
  readonly deletedMessageIds: number[] = [];

  /** Messages deleted by the bot (for convenience) */
  get deletedMessages(): { message_id: number }[] {
    return this.deletedMessageIds.map((id) => ({ message_id: id }));
  }

  /** Callback query answer (if any) */
  callbackAnswer?: {
    text?: string;
    showAlert?: boolean;
    url?: string;
    cacheTime?: number;
  };

  /** Poll sent/created by the bot */
  poll?: Poll;

  /** Inline query results (if answering inline query) */
  inlineResults?: InlineQueryResult[];

  /** Chat invite link (if created) */
  inviteLink?: ChatInviteLink;

  /** Invoice (if sent) */
  invoice?: Invoice;

  /** Pre-checkout query answer */
  preCheckoutAnswer?: { ok: boolean; errorMessage?: string };

  /** Error from API call (if any) */
  error?: TelegramError;

  /** All API calls made during this response */
  readonly apiCalls: ApiCallRecord[] = [];

  /**
   * Get the text of the last message sent, or undefined if no text messages.
   */
  get text(): string | undefined {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i];
      if ("text" in msg && msg.text) {
        return msg.text;
      }
    }
    return undefined;
  }

  /**
   * Get all text messages sent by the bot.
   */
  get texts(): string[] {
    return this.messages
      .filter((m): m is Message.TextMessage => "text" in m && typeof m.text === "string")
      .map((m) => m.text);
  }

  /**
   * Get the text of the last edited message, or undefined if none.
   */
  get editedText(): string | undefined {
    for (let i = this.editedMessages.length - 1; i >= 0; i--) {
      const msg = this.editedMessages[i];
      if ("text" in msg && msg.text) {
        return msg.text;
      }
    }
    return undefined;
  }

  /**
   * Get keyboard from the last message (inline or reply).
   */
  get keyboard():
    | {
        inline?: InlineKeyboardButton[][];
        reply?: KeyboardButton[][];
      }
    | undefined {
    const lastMsg = this.messages[this.messages.length - 1];
    if (!lastMsg || !("reply_markup" in lastMsg)) {
      return undefined;
    }

    const markup = (lastMsg as Message & { reply_markup?: unknown }).reply_markup;
    if (!markup || typeof markup !== "object") {
      return undefined;
    }

    const result: {
      inline?: InlineKeyboardButton[][];
      reply?: KeyboardButton[][];
    } = {};

    if ("inline_keyboard" in markup) {
      result.inline = (markup as { inline_keyboard: InlineKeyboardButton[][] }).inline_keyboard;
    }

    if ("keyboard" in markup) {
      result.reply = (markup as { keyboard: KeyboardButton[][] }).keyboard;
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * Get message entities from the last text message.
   */
  get entities(): MessageEntity[] | undefined {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i];
      if ("entities" in msg && msg.entities) {
        return msg.entities;
      }
    }
    return undefined;
  }

  /**
   * Get caption entities from the last message with a caption.
   */
  get captionEntities(): MessageEntity[] | undefined {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i] as Message & { caption_entities?: MessageEntity[] };
      if (msg.caption_entities) {
        return msg.caption_entities;
      }
    }
    return undefined;
  }

  /**
   * Check if any message contains specific text.
   */
  hasText(text: string): boolean {
    return this.texts.some((t) => t === text);
  }

  /**
   * Check if any message contains a substring.
   */
  hasTextContaining(substring: string): boolean {
    return this.texts.some((t) => t.includes(substring));
  }

  /**
   * Check if any message has an entity of the specified type.
   */
  hasEntity(type: MessageEntity["type"]): boolean {
    for (const msg of this.messages) {
      if ("entities" in msg && msg.entities) {
        if (msg.entities.some((e) => e.type === type)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get all entities of a specific type from all messages.
   */
  getEntitiesOfType(type: MessageEntity["type"]): MessageEntity[] {
    const result: MessageEntity[] = [];
    for (const msg of this.messages) {
      if ("entities" in msg && msg.entities) {
        result.push(...msg.entities.filter((e) => e.type === type));
      }
    }
    return result;
  }

  /**
   * Check if any message has an inline keyboard.
   */
  hasInlineKeyboard(): boolean {
    return this.keyboard?.inline !== undefined;
  }

  /**
   * Check if any message has a reply keyboard.
   */
  hasReplyKeyboard(): boolean {
    return this.keyboard?.reply !== undefined;
  }

  /**
   * Get a specific inline button by its text or callback data.
   */
  getInlineButton(textOrCallbackData: string): InlineKeyboardButton | undefined {
    const inline = this.keyboard?.inline;
    if (!inline) return undefined;

    for (const row of inline) {
      for (const button of row) {
        // Match by text first
        if (button.text === textOrCallbackData) {
          return button;
        }
        // Then try matching by callback_data
        if ("callback_data" in button && button.callback_data === textOrCallbackData) {
          return button;
        }
      }
    }
    return undefined;
  }

  /**
   * Get a specific inline button by its callback data only.
   */
  getInlineButtonByData(callbackData: string): InlineKeyboardButton | undefined {
    const inline = this.keyboard?.inline;
    if (!inline) return undefined;

    for (const row of inline) {
      for (const button of row) {
        if ("callback_data" in button && button.callback_data === callbackData) {
          return button;
        }
      }
    }
    return undefined;
  }

  /**
   * Get all inline buttons as a flat array.
   */
  getAllInlineButtons(): InlineKeyboardButton[] {
    const inline = this.keyboard?.inline;
    if (!inline) return [];
    return inline.flat();
  }

  /**
   * Check if response has any error.
   */
  hasError(): boolean {
    return this.error !== undefined;
  }

  /**
   * Check if error is a rate limit (429).
   */
  isRateLimited(): boolean {
    return this.error?.code === 429;
  }

  /**
   * Get retry_after value if rate limited.
   */
  getRetryAfter(): number | undefined {
    return this.error?.parameters?.retry_after;
  }

  /**
   * Check if a specific API method was called.
   */
  hasApiCall(method: string): boolean {
    return this.apiCalls.some((c) => c.method === method);
  }

  /**
   * Get API calls filtered by method name.
   */
  getApiCallsByMethod(method: string): ApiCallRecord[] {
    return this.apiCalls.filter((c) => c.method === method);
  }

  /**
   * Get the last API call of a specific method.
   */
  getLastApiCall(method: string): ApiCallRecord | undefined {
    const calls = this.getApiCallsByMethod(method);
    return calls[calls.length - 1];
  }

  /**
   * Internal: Add a message to this response.
   */
  _addMessage(message: Message): void {
    this.messages.push(message);
  }

  /**
   * Internal: Add an edited message to this response.
   */
  _addEditedMessage(message: Message): void {
    this.editedMessages.push(message);
  }

  /**
   * Internal: Record a deleted message.
   */
  _addDeletedMessageId(messageId: number): void {
    this.deletedMessageIds.push(messageId);
  }

  /**
   * Internal: Add an API call record.
   */
  _addApiCall(record: ApiCallRecord): void {
    this.apiCalls.push(record);
  }

  /**
   * Internal: Set callback answer.
   */
  _setCallbackAnswer(answer: {
    text?: string;
    showAlert?: boolean;
    url?: string;
    cacheTime?: number;
  }): void {
    this.callbackAnswer = answer;
  }

  /**
   * Internal: Set poll.
   */
  _setPoll(poll: Poll): void {
    this.poll = poll;
  }

  /**
   * Internal: Set inline results.
   */
  _setInlineResults(results: InlineQueryResult[]): void {
    this.inlineResults = results;
  }

  /**
   * Internal: Set invite link.
   */
  _setInviteLink(link: ChatInviteLink): void {
    this.inviteLink = link;
  }

  /**
   * Internal: Set error.
   */
  _setError(error: TelegramError): void {
    this.error = error;
  }

  /**
   * Internal: Set invoice.
   */
  _setInvoice(invoice: Invoice): void {
    this.invoice = invoice;
  }

  /**
   * Internal: Set pre-checkout answer.
   */
  _setPreCheckoutAnswer(answer: { ok: boolean; errorMessage?: string }): void {
    this.preCheckoutAnswer = answer;
  }
}

/**
 * Create a new BotResponse instance.
 */
export function createBotResponse(): BotResponse {
  return new BotResponse();
}
