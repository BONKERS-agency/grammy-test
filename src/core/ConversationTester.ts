import type { Chat, User, Message } from "grammy/types";
import type { TestBot } from "./TestBot.js";
import type { BotResponse } from "./BotResponse.js";
import type { SendMessageOptions } from "./TestBot.js";

/**
 * Helper for testing multi-step conversations.
 *
 * Provides a fluent API for simulating conversation flows where
 * the bot asks questions and waits for user responses.
 *
 * All methods return BotResponse objects that contain everything
 * the bot did in response to the user action.
 *
 * @example
 * ```typescript
 * const convo = createConversationTester(testBot, user, chat);
 *
 * const r1 = await convo.start("/order");
 * expect(r1.text).toBe("What pizza size?");
 *
 * const r2 = await convo.say("large");
 * expect(r2.text).toBe("What toppings?");
 *
 * const r3 = await convo.say("pepperoni");
 * expect(r3.text).toContain("Order confirmed");
 * ```
 */
export class ConversationTester {
  private testBot: TestBot;
  private user: User;
  private chat: Chat;
  private stepCount = 0;
  private lastResponse: BotResponse | null = null;

  constructor(testBot: TestBot, user: User, chat: Chat) {
    this.testBot = testBot;
    this.user = user;
    this.chat = chat;
  }

  /**
   * Start a conversation by sending a command.
   * Returns a BotResponse containing all bot actions.
   */
  async start(command: string, args?: string): Promise<BotResponse> {
    const response = await this.testBot.sendCommand(this.user, this.chat, command, args);
    this.stepCount++;
    this.lastResponse = response;
    return response;
  }

  /**
   * Send a text message as the next step in the conversation.
   * Returns a BotResponse containing all bot actions.
   */
  async say(text: string, options?: SendMessageOptions): Promise<BotResponse> {
    const response = await this.testBot.sendMessage(this.user, this.chat, text, options);
    this.stepCount++;
    this.lastResponse = response;
    return response;
  }

  /**
   * Click an inline keyboard button.
   * Returns a BotResponse containing all bot actions.
   */
  async click(callbackData: string, fromMessage?: Message): Promise<BotResponse> {
    const response = await this.testBot.clickButton(this.user, this.chat, callbackData, fromMessage);
    this.stepCount++;
    this.lastResponse = response;
    return response;
  }

  /**
   * Send a command during the conversation.
   * Returns a BotResponse containing all bot actions.
   */
  async command(cmd: string, args?: string): Promise<BotResponse> {
    const response = await this.testBot.sendCommand(this.user, this.chat, cmd, args);
    this.stepCount++;
    this.lastResponse = response;
    return response;
  }

  /**
   * Get the last BotResponse from the conversation.
   */
  getLastResponse(): BotResponse | null {
    return this.lastResponse;
  }

  /**
   * Get the last message sent by the bot (from the last response).
   */
  getLastBotMessage(): Message | undefined {
    if (!this.lastResponse) return undefined;
    const messages = this.lastResponse.messages;
    return messages[messages.length - 1];
  }

  /**
   * Get the text of the last bot message (from the last response).
   */
  getLastBotText(): string | undefined {
    return this.lastResponse?.text;
  }

  /**
   * Get all messages sent by the bot in this chat.
   */
  getBotMessages(): Message[] {
    return this.testBot.server.getBotMessages(this.chat.id);
  }

  /**
   * Get the last callback answer (from the last response).
   */
  getLastCallbackAnswer(): string | undefined {
    return this.lastResponse?.callbackAnswer?.text;
  }

  /**
   * Get the number of steps taken in this conversation.
   */
  getStepCount(): number {
    return this.stepCount;
  }

  /**
   * Get all messages (user and bot) in the chat.
   */
  getAllMessages(): Message[] {
    return this.testBot.server.getAllMessages(this.chat.id);
  }

  /**
   * Assert that the bot sent a specific message at some point.
   */
  hasBotMessage(text: string): boolean {
    return this.getBotMessages().some(
      (m) => "text" in m && m.text === text
    );
  }

  /**
   * Assert that the bot sent a message containing specific text.
   */
  hasBotMessageContaining(substring: string): boolean {
    return this.getBotMessages().some(
      (m) => "text" in m && m.text?.includes(substring)
    );
  }
}

/**
 * Create a conversation tester for simulating multi-step conversations.
 *
 * All methods now return BotResponse objects that contain everything
 * the bot did in response to the user action.
 *
 * @example
 * ```typescript
 * const convo = createConversationTester(testBot, user, chat);
 *
 * const r1 = await convo.start("/order");
 * expect(r1.text).toBe("What pizza size?");
 *
 * const r2 = await convo.say("large");
 * expect(r2.text).toBe("What toppings?");
 *
 * const r3 = await convo.say("pepperoni");
 * expect(r3.text).toContain("Order confirmed");
 * ```
 */
export function createConversationTester(
  testBot: TestBot,
  user: User,
  chat: Chat
): ConversationTester {
  return new ConversationTester(testBot, user, chat);
}
