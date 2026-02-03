import type {
  Chat,
  ChatPermissions,
  ChatInviteLink,
  Message,
  User,
  ForumTopic,
  ReactionType,
} from "grammy/types";

/**
 * Stored invite link with usage tracking.
 */
export interface StoredInviteLink extends ChatInviteLink {
  /** Number of times this link has been used */
  usage_count: number;
  /** User IDs who joined via this link (internal tracking) */
  joinedUserIds: Set<number>;
  /** Pending join request user IDs (internal tracking) */
  pendingRequestUserIds: Set<number>;
  /** Pending join request users for approval (internal tracking) */
  pendingRequestUsers: Map<number, User>;
}

/**
 * Stored forum topic state.
 */
export interface StoredForumTopic {
  topic: ForumTopic;
  isClosed: boolean;
  isPinned: boolean;
}

/**
 * State for a single chat.
 */
export interface ChatStateData {
  chat: Chat;
  /** Default permissions for the chat */
  permissions: ChatPermissions;
  /** Slow mode delay in seconds (0 = disabled) */
  slowModeDelay: number;
  /** All messages in this chat */
  messages: Message[];
  /** Pinned message IDs */
  pinnedMessageIds: Set<number>;
  /** Primary invite link */
  primaryInviteLink?: string;
  /** All invite links for this chat */
  inviteLinks: Map<string, StoredInviteLink>;
  /** Forum topics (for supergroups with topics enabled) */
  forumTopics: Map<number, StoredForumTopic>;
  /** Whether this chat is a forum (has topics) */
  isForum: boolean;
  /** General topic thread ID */
  generalTopicId?: number;
  /** Whether the general topic is hidden */
  generalTopicHidden?: boolean;
  /** Chat description */
  description?: string;
  /** Bio (for private chats) */
  bio?: string;
  /** Chat photo file ID */
  photoFileId?: string;
  /** Whether chat has a photo */
  hasPhoto: boolean;
  /** Whether members can send messages (for locked chats) */
  isLocked: boolean;
  /** Available reactions for this chat */
  availableReactions?: {
    type: "all" | "some";
    reactions?: ReactionType[];
  };
}

/**
 * Manages chat state including permissions, slow mode, invite links, and forum topics.
 */
export class ChatState {
  private chats = new Map<number, ChatStateData>();
  private inviteLinkCounter = 1;
  private topicIdCounter = 1;

  /**
   * Get or create chat state.
   */
  getOrCreate(chat: Chat): ChatStateData {
    let state = this.chats.get(chat.id);
    if (!state) {
      state = this.createChatState(chat);
      this.chats.set(chat.id, state);
    }
    return state;
  }

  /**
   * Get chat state if it exists.
   */
  get(chatId: number): ChatStateData | undefined {
    return this.chats.get(chatId);
  }

  /**
   * Check if a chat exists.
   */
  has(chatId: number): boolean {
    return this.chats.has(chatId);
  }

  /**
   * Create default chat state.
   */
  private createChatState(chat: Chat): ChatStateData {
    return {
      chat,
      permissions: this.getDefaultPermissions(chat.type),
      slowModeDelay: 0,
      messages: [],
      pinnedMessageIds: new Set(),
      inviteLinks: new Map(),
      forumTopics: new Map(),
      isForum: false,
      isLocked: false,
      hasPhoto: false,
    };
  }

  /**
   * Get default permissions based on chat type.
   */
  private getDefaultPermissions(chatType: Chat["type"]): ChatPermissions {
    if (chatType === "private") {
      return {
        can_send_messages: true,
        can_send_audios: true,
        can_send_documents: true,
        can_send_photos: true,
        can_send_videos: true,
        can_send_video_notes: true,
        can_send_voice_notes: true,
        can_send_polls: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
        can_change_info: false,
        can_invite_users: false,
        can_pin_messages: false,
        can_manage_topics: false,
      };
    }

    // Default permissions for groups/supergroups
    return {
      can_send_messages: true,
      can_send_audios: true,
      can_send_documents: true,
      can_send_photos: true,
      can_send_videos: true,
      can_send_video_notes: true,
      can_send_voice_notes: true,
      can_send_polls: true,
      can_send_other_messages: true,
      can_add_web_page_previews: true,
      can_change_info: false,
      can_invite_users: true,
      can_pin_messages: false,
      can_manage_topics: false,
    };
  }

  // === Permission Management ===

  /**
   * Set chat permissions.
   */
  setPermissions(chatId: number, permissions: ChatPermissions): void {
    const state = this.chats.get(chatId);
    if (state) {
      state.permissions = { ...state.permissions, ...permissions };
    }
  }

  /**
   * Get chat permissions.
   */
  getPermissions(chatId: number): ChatPermissions | undefined {
    return this.chats.get(chatId)?.permissions;
  }

  // === Slow Mode ===

  /**
   * Set slow mode delay for a chat.
   * @param delay Delay in seconds (0 to disable, valid values: 0, 10, 30, 60, 300, 900, 3600)
   */
  setSlowModeDelay(chatId: number, delay: number): boolean {
    const validDelays = [0, 10, 30, 60, 300, 900, 3600];
    if (!validDelays.includes(delay)) {
      return false;
    }

    const state = this.chats.get(chatId);
    if (state) {
      state.slowModeDelay = delay;
      return true;
    }
    return false;
  }

  /**
   * Get slow mode delay for a chat.
   */
  getSlowModeDelay(chatId: number): number {
    return this.chats.get(chatId)?.slowModeDelay ?? 0;
  }

  // === Chat Permissions ===

  /**
   * Set default permissions for a chat.
   */
  setChatPermissions(chatId: number, permissions: ChatPermissions): boolean {
    const state = this.chats.get(chatId);
    if (state) {
      state.permissions = { ...state.permissions, ...permissions };
      return true;
    }
    return false;
  }

  /**
   * Get default permissions for a chat.
   */
  getChatPermissions(chatId: number): ChatPermissions | undefined {
    return this.chats.get(chatId)?.permissions;
  }

  /**
   * Set available reactions for a chat.
   */
  setAvailableReactions(
    chatId: number,
    reactions: { type: "all" | "some"; reactions?: ReactionType[] }
  ): boolean {
    const state = this.chats.get(chatId);
    if (state) {
      state.availableReactions = reactions;
      return true;
    }
    return false;
  }

  // === Message Management ===

  /**
   * Store a message in the chat.
   */
  storeMessage(chatId: number, message: Message): void {
    const state = this.chats.get(chatId);
    if (state) {
      state.messages.push(message);
    }
  }

  /**
   * Get a message by ID.
   */
  getMessage(chatId: number, messageId: number): Message | undefined {
    const state = this.chats.get(chatId);
    return state?.messages.find((m) => m.message_id === messageId);
  }

  /**
   * Delete a message.
   */
  deleteMessage(chatId: number, messageId: number): boolean {
    const state = this.chats.get(chatId);
    if (!state) return false;

    const index = state.messages.findIndex((m) => m.message_id === messageId);
    if (index === -1) return false;

    state.messages.splice(index, 1);
    state.pinnedMessageIds.delete(messageId);
    return true;
  }

  /**
   * Get all messages in a chat.
   */
  getAllMessages(chatId: number): Message[] {
    return this.chats.get(chatId)?.messages ?? [];
  }

  /**
   * Get messages from a specific user.
   */
  getMessagesFromUser(chatId: number, userId: number): Message[] {
    const state = this.chats.get(chatId);
    if (!state) return [];
    return state.messages.filter((m) => m.from?.id === userId);
  }

  // === Pin Management ===

  /**
   * Pin a message.
   */
  pinMessage(chatId: number, messageId: number): boolean {
    const state = this.chats.get(chatId);
    if (!state) return false;

    const message = state.messages.find((m) => m.message_id === messageId);
    if (!message) return false;

    state.pinnedMessageIds.add(messageId);
    return true;
  }

  /**
   * Unpin a message.
   */
  unpinMessage(chatId: number, messageId: number): boolean {
    const state = this.chats.get(chatId);
    if (!state) return false;

    return state.pinnedMessageIds.delete(messageId);
  }

  /**
   * Unpin all messages.
   */
  unpinAllMessages(chatId: number): void {
    const state = this.chats.get(chatId);
    if (state) {
      state.pinnedMessageIds.clear();
    }
  }

  /**
   * Get all pinned message IDs.
   */
  getPinnedMessageIds(chatId: number): number[] {
    const state = this.chats.get(chatId);
    return state ? Array.from(state.pinnedMessageIds) : [];
  }

  // === Invite Link Management ===

  /**
   * Create a chat invite link.
   */
  createInviteLink(
    chatId: number,
    creator: User,
    options: {
      name?: string;
      expireDate?: number;
      expire_date?: number;
      memberLimit?: number;
      member_limit?: number;
      createsJoinRequest?: boolean;
      creates_join_request?: boolean;
      subscriptionPeriod?: number;
      subscription_period?: number;
      subscriptionPrice?: number;
      subscription_price?: number;
    } = {}
  ): StoredInviteLink | undefined {
    const state = this.chats.get(chatId);
    if (!state) return undefined;

    const inviteLink = `https://t.me/+test_invite_${this.inviteLinkCounter++}`;

    const link: StoredInviteLink = {
      invite_link: inviteLink,
      creator,
      creates_join_request: options.createsJoinRequest ?? options.creates_join_request ?? false,
      is_primary: false,
      is_revoked: false,
      name: options.name,
      expire_date: options.expireDate ?? options.expire_date,
      member_limit: options.memberLimit ?? options.member_limit,
      subscription_period: options.subscriptionPeriod ?? options.subscription_period,
      subscription_price: options.subscriptionPrice ?? options.subscription_price,
      pending_join_request_count: 0,
      usage_count: 0,
      joinedUserIds: new Set(),
      pendingRequestUserIds: new Set(),
      pendingRequestUsers: new Map(),
    };

    state.inviteLinks.set(inviteLink, link);
    return link;
  }

  /**
   * Edit an existing invite link.
   */
  editInviteLink(
    chatId: number,
    inviteLink: string,
    options: {
      name?: string;
      expireDate?: number;
      memberLimit?: number;
      createsJoinRequest?: boolean;
    }
  ): StoredInviteLink | undefined {
    const state = this.chats.get(chatId);
    if (!state) return undefined;

    const link = state.inviteLinks.get(inviteLink);
    if (!link || link.is_revoked) return undefined;

    if (options.name !== undefined) link.name = options.name;
    if (options.expireDate !== undefined) link.expire_date = options.expireDate;
    if (options.memberLimit !== undefined) link.member_limit = options.memberLimit;
    if (options.createsJoinRequest !== undefined) link.creates_join_request = options.createsJoinRequest;

    return link;
  }

  /**
   * Revoke an invite link.
   */
  revokeInviteLink(chatId: number, inviteLink: string): StoredInviteLink | undefined {
    const state = this.chats.get(chatId);
    if (!state) return undefined;

    const link = state.inviteLinks.get(inviteLink);
    if (!link) return undefined;

    link.is_revoked = true;
    return link;
  }

  /**
   * Export (get or create) the primary invite link.
   */
  exportInviteLink(chatId: number, creator: User): string | undefined {
    const state = this.chats.get(chatId);
    if (!state) return undefined;

    if (!state.primaryInviteLink) {
      const link = this.createInviteLink(chatId, creator);
      if (link) {
        link.is_primary = true;
        state.primaryInviteLink = link.invite_link;
      }
    }

    return state.primaryInviteLink;
  }

  /**
   * Get an invite link.
   */
  getInviteLink(chatId: number, inviteLink: string): StoredInviteLink | undefined {
    const state = this.chats.get(chatId);
    return state?.inviteLinks.get(inviteLink);
  }

  /**
   * Get all invite links for a chat.
   */
  getInviteLinks(chatId: number): StoredInviteLink[] {
    const state = this.chats.get(chatId);
    return state ? Array.from(state.inviteLinks.values()) : [];
  }

  /**
   * Check if an invite link is valid (not revoked, not expired, not at limit).
   */
  isInviteLinkValid(chatId: number, inviteLink: string): boolean {
    const link = this.getInviteLink(chatId, inviteLink);
    if (!link || link.is_revoked) return false;

    if (link.expire_date && link.expire_date < Math.floor(Date.now() / 1000)) {
      return false;
    }

    if (link.member_limit && link.usage_count >= link.member_limit) {
      return false;
    }

    return true;
  }

  /**
   * Use an invite link (increment usage count).
   */
  useInviteLink(chatId: number, inviteLink: string, userId: number): boolean {
    const link = this.getInviteLink(chatId, inviteLink);
    if (!link || !this.isInviteLinkValid(chatId, inviteLink)) return false;

    link.usage_count++;
    link.joinedUserIds.add(userId);
    return true;
  }

  /**
   * Add a join request to an invite link.
   */
  addJoinRequest(chatId: number, inviteLink: string, user: User): boolean {
    const link = this.getInviteLink(chatId, inviteLink);
    if (!link || link.is_revoked || !link.creates_join_request) return false;

    link.pendingRequestUserIds.add(user.id);
    link.pendingRequestUsers.set(user.id, user);
    link.pending_join_request_count = link.pendingRequestUserIds.size;
    return true;
  }

  /**
   * Get a pending join request user.
   */
  getJoinRequestUser(chatId: number, userId: number): User | undefined {
    const state = this.chats.get(chatId);
    if (!state) return undefined;

    for (const link of state.inviteLinks.values()) {
      const user = link.pendingRequestUsers.get(userId);
      if (user) return user;
    }
    return undefined;
  }

  /**
   * Remove a join request (approved or declined).
   */
  removeJoinRequest(chatId: number, inviteLink: string, userId: number): boolean {
    const link = this.getInviteLink(chatId, inviteLink);
    if (!link) return false;

    const removed = link.pendingRequestUserIds.delete(userId);
    link.pendingRequestUsers.delete(userId);
    link.pending_join_request_count = link.pendingRequestUserIds.size;
    return removed;
  }

  /**
   * Get all pending join requests across all invite links for a chat.
   */
  getJoinRequests(chatId: number): { userId: number; inviteLink: string }[] {
    const state = this.chats.get(chatId);
    if (!state) return [];

    const requests: { userId: number; inviteLink: string }[] = [];
    for (const [inviteLink, link] of state.inviteLinks) {
      for (const userId of link.pendingRequestUserIds) {
        requests.push({ userId, inviteLink });
      }
    }
    return requests;
  }

  // === Forum Topic Management ===

  /**
   * Enable forum topics for a supergroup.
   */
  enableForum(chatId: number): boolean {
    const state = this.chats.get(chatId);
    if (!state || state.chat.type !== "supergroup") return false;

    state.isForum = true;

    // Create general topic
    state.generalTopicId = 1;
    state.forumTopics.set(1, {
      topic: {
        message_thread_id: 1,
        name: "General",
        icon_color: 0x6FB9F0,
      },
      isClosed: false,
      isPinned: true,
    });

    return true;
  }

  /**
   * Create a forum topic.
   * Supports two calling conventions:
   * - createForumTopic(chatId, name, options) - name as separate arg
   * - createForumTopic(chatId, { name, ...options }) - name in options
   */
  createForumTopic(
    chatId: number,
    nameOrOptions: string | { name: string; icon_color?: number; iconColor?: number; iconCustomEmojiId?: string; is_closed?: boolean },
    options: {
      iconColor?: number;
      iconCustomEmojiId?: string;
    } = {}
  ): ForumTopic | undefined {
    const state = this.chats.get(chatId);
    if (!state || !state.isForum) return undefined;

    // Handle both calling conventions
    let name: string;
    let iconColor: number | undefined;
    let iconCustomEmojiId: string | undefined;
    let isClosed = false;

    if (typeof nameOrOptions === "string") {
      name = nameOrOptions;
      iconColor = options.iconColor;
      iconCustomEmojiId = options.iconCustomEmojiId;
    } else {
      name = nameOrOptions.name;
      iconColor = nameOrOptions.icon_color ?? nameOrOptions.iconColor;
      iconCustomEmojiId = nameOrOptions.iconCustomEmojiId;
      isClosed = nameOrOptions.is_closed ?? false;
    }

    const messageThreadId = ++this.topicIdCounter;
    const topic: ForumTopic = {
      message_thread_id: messageThreadId,
      name,
      icon_color: iconColor ?? 0x6FB9F0,
      icon_custom_emoji_id: iconCustomEmojiId,
    };

    state.forumTopics.set(messageThreadId, {
      topic,
      isClosed,
      isPinned: false,
    });

    return topic;
  }

  /**
   * Edit a forum topic.
   */
  editForumTopic(
    chatId: number,
    messageThreadId: number,
    options: {
      name?: string;
      iconCustomEmojiId?: string;
    }
  ): boolean {
    const state = this.chats.get(chatId);
    if (!state) return false;

    const stored = state.forumTopics.get(messageThreadId);
    if (!stored) return false;

    if (options.name !== undefined) {
      stored.topic.name = options.name;
    }
    if (options.iconCustomEmojiId !== undefined) {
      stored.topic.icon_custom_emoji_id = options.iconCustomEmojiId;
    }

    return true;
  }

  /**
   * Close a forum topic.
   */
  closeForumTopic(chatId: number, messageThreadId: number): boolean {
    const state = this.chats.get(chatId);
    if (!state) return false;

    const stored = state.forumTopics.get(messageThreadId);
    if (!stored) return false;

    stored.isClosed = true;
    return true;
  }

  /**
   * Reopen a forum topic.
   */
  reopenForumTopic(chatId: number, messageThreadId: number): boolean {
    const state = this.chats.get(chatId);
    if (!state) return false;

    const stored = state.forumTopics.get(messageThreadId);
    if (!stored) return false;

    stored.isClosed = false;
    return true;
  }

  /**
   * Delete a forum topic.
   */
  deleteForumTopic(chatId: number, messageThreadId: number): boolean {
    const state = this.chats.get(chatId);
    if (!state) return false;

    // Can't delete general topic
    if (messageThreadId === state.generalTopicId) return false;

    return state.forumTopics.delete(messageThreadId);
  }

  /**
   * Get a forum topic.
   * Returns a merged object with topic properties and state flags.
   */
  getForumTopic(chatId: number, messageThreadId: number): (ForumTopic & { is_closed: boolean; isPinned: boolean }) | undefined {
    const state = this.chats.get(chatId);
    const stored = state?.forumTopics.get(messageThreadId);
    if (!stored) return undefined;
    return {
      ...stored.topic,
      is_closed: stored.isClosed,
      isPinned: stored.isPinned,
    };
  }

  /**
   * Get all forum topics.
   * Returns merged objects with topic properties and state flags.
   */
  getForumTopics(chatId: number): (ForumTopic & { is_closed: boolean; isPinned: boolean })[] {
    const state = this.chats.get(chatId);
    if (!state) return [];
    return Array.from(state.forumTopics.values()).map((stored) => ({
      ...stored.topic,
      is_closed: stored.isClosed,
      isPinned: stored.isPinned,
    }));
  }

  /**
   * Check if a topic is closed.
   */
  isForumTopicClosed(chatId: number, messageThreadId: number): boolean {
    const stored = this.chats.get(chatId)?.forumTopics.get(messageThreadId);
    return stored?.isClosed ?? false;
  }

  /**
   * Set whether the general topic is hidden.
   */
  setGeneralTopicHidden(chatId: number, hidden: boolean): boolean {
    const state = this.chats.get(chatId);
    if (!state || !state.isForum) return false;
    state.generalTopicHidden = hidden;
    return true;
  }

  /**
   * Get whether the general topic is hidden.
   */
  isGeneralTopicHidden(chatId: number): boolean {
    return this.chats.get(chatId)?.generalTopicHidden ?? false;
  }

  // === Lock/Unlock Chat ===

  /**
   * Lock a chat (disable sending messages).
   */
  lockChat(chatId: number): boolean {
    const state = this.chats.get(chatId);
    if (!state) return false;

    state.isLocked = true;
    state.permissions.can_send_messages = false;
    return true;
  }

  /**
   * Unlock a chat (enable sending messages).
   */
  unlockChat(chatId: number): boolean {
    const state = this.chats.get(chatId);
    if (!state) return false;

    state.isLocked = false;
    state.permissions.can_send_messages = true;
    return true;
  }

  /**
   * Check if a chat is locked.
   */
  isLocked(chatId: number): boolean {
    return this.chats.get(chatId)?.isLocked ?? false;
  }

  // === State Management ===

  /**
   * Reset all chat state.
   */
  reset(): void {
    this.chats.clear();
    this.inviteLinkCounter = 1;
    this.topicIdCounter = 1;
  }

  /**
   * Delete a chat's state.
   */
  delete(chatId: number): boolean {
    return this.chats.delete(chatId);
  }
}

/**
 * Create a new ChatState instance.
 */
export function createChatState(): ChatState {
  return new ChatState();
}
