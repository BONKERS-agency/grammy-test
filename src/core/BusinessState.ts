import type { BusinessConnection, User } from "grammy/types";

/**
 * Stored business connection.
 */
export interface StoredBusinessConnection {
  id: string;
  user: User;
  user_chat_id: number;
  date: number;
  can_reply: boolean;
  is_enabled: boolean;
}

/**
 * Stored business message tracking.
 */
export interface StoredBusinessMessage {
  business_connection_id: string;
  message_id: number;
  chat_id: number;
  date: number;
}

/**
 * Manages business connections and business messages.
 */
export class BusinessState {
  /** Business connections by ID */
  private connections = new Map<string, StoredBusinessConnection>();

  /** Business messages */
  private businessMessages: StoredBusinessMessage[] = [];

  /** Connection ID counter */
  private connectionIdCounter = 1;

  /**
   * Create a new business connection.
   */
  createConnection(
    user: User,
    userChatId: number,
    options: {
      canReply?: boolean;
      isEnabled?: boolean;
    } = {},
  ): StoredBusinessConnection {
    const connection: StoredBusinessConnection = {
      id: `business_connection_${this.connectionIdCounter++}`,
      user,
      user_chat_id: userChatId,
      date: Math.floor(Date.now() / 1000),
      can_reply: options.canReply ?? true,
      is_enabled: options.isEnabled ?? true,
    };

    this.connections.set(connection.id, connection);
    return connection;
  }

  /**
   * Get a business connection by ID.
   */
  getConnection(connectionId: string): StoredBusinessConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get all business connections.
   */
  getAllConnections(): StoredBusinessConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get business connections for a specific user.
   */
  getConnectionsForUser(userId: number): StoredBusinessConnection[] {
    return Array.from(this.connections.values()).filter((c) => c.user.id === userId);
  }

  /**
   * Update a business connection.
   */
  updateConnection(
    connectionId: string,
    updates: Partial<Pick<StoredBusinessConnection, "can_reply" | "is_enabled">>,
  ): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) return false;

    if (updates.can_reply !== undefined) {
      connection.can_reply = updates.can_reply;
    }
    if (updates.is_enabled !== undefined) {
      connection.is_enabled = updates.is_enabled;
    }

    return true;
  }

  /**
   * Delete a business connection.
   */
  deleteConnection(connectionId: string): boolean {
    return this.connections.delete(connectionId);
  }

  /**
   * Track a business message.
   */
  trackBusinessMessage(
    businessConnectionId: string,
    messageId: number,
    chatId: number,
  ): StoredBusinessMessage | undefined {
    const connection = this.connections.get(businessConnectionId);
    if (!connection) return undefined;

    const message: StoredBusinessMessage = {
      business_connection_id: businessConnectionId,
      message_id: messageId,
      chat_id: chatId,
      date: Math.floor(Date.now() / 1000),
    };

    this.businessMessages.push(message);
    return message;
  }

  /**
   * Get business messages for a connection.
   */
  getBusinessMessages(connectionId: string): StoredBusinessMessage[] {
    return this.businessMessages.filter((m) => m.business_connection_id === connectionId);
  }

  /**
   * Convert stored connection to Telegram BusinessConnection type.
   */
  toBusinessConnection(connectionId: string): BusinessConnection | undefined {
    const stored = this.connections.get(connectionId);
    if (!stored) return undefined;

    return {
      id: stored.id,
      user: stored.user,
      user_chat_id: stored.user_chat_id,
      date: stored.date,
      is_enabled: stored.is_enabled,
      // can_reply is stored locally but BusinessConnection uses rights field
      rights: stored.can_reply ? { can_reply: true } : undefined,
    } as BusinessConnection;
  }

  /**
   * Reset all business state.
   */
  reset(): void {
    this.connections.clear();
    this.businessMessages = [];
    this.connectionIdCounter = 1;
  }
}

/**
 * Create a new BusinessState instance.
 */
export function createBusinessState(): BusinessState {
  return new BusinessState();
}
