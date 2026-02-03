import type { Chat, User, UserFromGetMe } from "grammy/types";

export interface TestUser extends User {
  is_bot: false;
}

export type TestBotUser = UserFromGetMe;

export interface TestChat {
  id: number;
  type: Chat["type"];
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface TestBotConfig {
  botInfo?: TestBotUser;
}

export interface SendMessageOptions {
  replyToMessageId?: number;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
}
