import type { Context, SessionFlavor, Api, RawApi } from "grammy";
import type {
  Conversation,
  ConversationFlavor,
} from "@grammyjs/conversations";

/**
 * Session data structure
 */
export interface SessionData {
  // Order conversation state
  order?: {
    size?: string;
    toppings?: string;
  };
  // User preferences
  language?: string;
  notifications?: boolean;
  // Stats
  messageCount: number;
  commandCount: number;
}

/**
 * Custom context type with session and conversation support
 */
export type MyContext = Context &
  SessionFlavor<SessionData> &
  ConversationFlavor;

/**
 * Conversation type alias
 */
export type MyConversation = Conversation<MyContext>;

/**
 * Default session data factory
 */
export function createInitialSessionData(): SessionData {
  return {
    messageCount: 0,
    commandCount: 0,
    notifications: true,
  };
}

/**
 * Bot configuration
 */
export interface BotConfig {
  token: string;
  adminIds?: number[];
  webhookUrl?: string;
  webhookSecret?: string;
}
