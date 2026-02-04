import type {
  ChatAdministratorRights,
  ChatMember,
  ChatPermissions,
  PhotoSize,
  User,
} from "grammy/types";

/**
 * Chat member status.
 */
export type MemberStatus =
  | "creator"
  | "administrator"
  | "member"
  | "restricted"
  | "left"
  | "kicked";

/**
 * Profile photo stored for a user.
 */
export interface StoredProfilePhoto {
  photos: PhotoSize[][];
}

/**
 * Stored member data including restrictions and admin rights.
 * Properties use snake_case to match Telegram API naming.
 */
export interface StoredMember {
  user: User;
  status: MemberStatus;
  /** When the restriction/ban expires (0 = forever) */
  until_date: number;
  /** Custom title for admins */
  custom_title?: string;
  /** Whether admin is anonymous */
  is_anonymous: boolean;
  /** Admin rights (if administrator) */
  adminRights?: ChatAdministratorRights;
  /** Restricted permissions (if restricted) */
  restrictedPermissions?: ChatPermissions;
  /** Whether the user can manage the chat (internal tracking) */
  canManageChat: boolean;
  /** When the member joined (internal tracking) */
  joinDate: number;
  /** Last message timestamp for slow mode (internal tracking) */
  lastMessageTime: number;
  /** Invite link used to join (internal tracking) */
  inviteLink?: string;
  /** Premium status */
  is_premium?: boolean;
}

/**
 * Rate limiting state for a chat.
 */
export interface RateLimitState {
  /** Messages sent in current second */
  messagesThisSecond: number;
  /** Current second timestamp */
  currentSecond: number;
  /** Messages sent in current minute (for groups) */
  messagesThisMinute: number;
  /** Current minute timestamp */
  currentMinute: number;
}

/**
 * Manages chat member state including permissions, restrictions, and rate limiting.
 */
export class MemberState {
  /** Map of chatId -> userId -> member data */
  private members = new Map<number, Map<number, StoredMember>>();

  /** Rate limit state per chat */
  private rateLimits = new Map<number, RateLimitState>();

  /** User profile photos: userId -> array of photo arrays */
  private profilePhotos = new Map<number, PhotoSize[][]>();

  /** Simulated current time (can be advanced for testing) */
  private currentTime: number = Date.now();

  /** File ID counter for generating unique IDs */
  private fileIdCounter = 1;

  /** Premium users (tracked globally, not per-chat) */
  private premiumUsers = new Set<number>();

  /**
   * Get the current simulated time.
   */
  getCurrentTime(): number {
    return this.currentTime;
  }

  /**
   * Set the current simulated time.
   */
  setCurrentTime(time: number): void {
    this.currentTime = time;
  }

  /**
   * Advance time by a number of seconds.
   */
  advanceTime(seconds: number): void {
    this.currentTime += seconds * 1000;
  }

  /**
   * Get current Unix timestamp.
   */
  private timestamp(): number {
    return Math.floor(this.currentTime / 1000);
  }

  // === Member Management ===

  /**
   * Get or create members map for a chat.
   */
  private getChatMembers(chatId: number): Map<number, StoredMember> {
    let members = this.members.get(chatId);
    if (!members) {
      members = new Map();
      this.members.set(chatId, members);
    }
    return members;
  }

  /**
   * Add or update a member in a chat.
   */
  setMember(chatId: number, user: User, status: MemberStatus = "member"): StoredMember {
    const members = this.getChatMembers(chatId);
    const existing = members.get(user.id);

    const member: StoredMember = {
      user,
      status,
      until_date: 0,
      is_anonymous: false,
      canManageChat: status === "creator" || status === "administrator",
      joinDate: existing?.joinDate ?? this.timestamp(),
      lastMessageTime: existing?.lastMessageTime ?? 0,
      inviteLink: existing?.inviteLink,
    };

    members.set(user.id, member);
    return member;
  }

  /**
   * Get a member from a chat.
   */
  getMember(chatId: number, userId: number): StoredMember | undefined {
    return this.members.get(chatId)?.get(userId);
  }

  /**
   * Check if a user is a member of a chat.
   */
  isMember(chatId: number, userId: number): boolean {
    const member = this.getMember(chatId, userId);
    if (!member) return false;
    return member.status !== "left" && member.status !== "kicked";
  }

  /**
   * Get all members of a chat.
   */
  getAllMembers(chatId: number): StoredMember[] {
    const members = this.members.get(chatId);
    return members ? Array.from(members.values()) : [];
  }

  /**
   * Get all administrators of a chat.
   */
  getAdministrators(chatId: number): StoredMember[] {
    return this.getAllMembers(chatId).filter(
      (m) => m.status === "administrator" || m.status === "creator",
    );
  }

  /**
   * Set a member as the chat owner (creator).
   */
  setOwner(
    chatId: number,
    user: User,
    options: { customTitle?: string; isAnonymous?: boolean } = {},
  ): StoredMember {
    const member = this.setMember(chatId, user, "creator");
    member.custom_title = options.customTitle;
    member.is_anonymous = options.isAnonymous ?? false;
    member.canManageChat = true;
    member.adminRights = {
      is_anonymous: options.isAnonymous ?? false,
      can_manage_chat: true,
      can_delete_messages: true,
      can_manage_video_chats: true,
      can_restrict_members: true,
      can_promote_members: true,
      can_change_info: true,
      can_invite_users: true,
      can_post_stories: true,
      can_edit_stories: true,
      can_delete_stories: true,
      can_pin_messages: true,
      can_manage_topics: true,
    };
    return member;
  }

  /**
   * Promote a member to administrator.
   */
  setAdmin(
    chatId: number,
    user: User,
    rights: Partial<ChatAdministratorRights>,
    options: { customTitle?: string; isAnonymous?: boolean } = {},
  ): StoredMember {
    const member = this.setMember(chatId, user, "administrator");
    const isAnonymous = options.isAnonymous ?? rights.is_anonymous ?? false;
    member.custom_title = options.customTitle;
    member.is_anonymous = isAnonymous;
    member.canManageChat = true;
    member.adminRights = {
      is_anonymous: isAnonymous,
      can_manage_chat: rights.can_manage_chat ?? false,
      can_delete_messages: rights.can_delete_messages ?? false,
      can_manage_video_chats: rights.can_manage_video_chats ?? false,
      can_restrict_members: rights.can_restrict_members ?? false,
      can_promote_members: rights.can_promote_members ?? false,
      can_change_info: rights.can_change_info ?? false,
      can_invite_users: rights.can_invite_users ?? false,
      can_post_stories: rights.can_post_stories ?? false,
      can_edit_stories: rights.can_edit_stories ?? false,
      can_delete_stories: rights.can_delete_stories ?? false,
      can_pin_messages: rights.can_pin_messages ?? false,
      can_manage_topics: rights.can_manage_topics ?? false,
    };
    return member;
  }

  /**
   * Demote an administrator to regular member.
   */
  demote(chatId: number, userId: number): boolean {
    const member = this.getMember(chatId, userId);
    if (!member || member.status === "creator") return false;

    member.status = "member";
    member.adminRights = undefined;
    member.custom_title = undefined;
    member.is_anonymous = false;
    member.canManageChat = false;

    return true;
  }

  /**
   * Restrict a member's permissions.
   */
  restrict(
    chatId: number,
    userId: number,
    permissions: ChatPermissions,
    untilDate: number = 0,
  ): boolean {
    const member = this.getMember(chatId, userId);
    if (!member) return false;
    if (member.status === "creator" || member.status === "administrator") return false;

    member.status = "restricted";
    member.restrictedPermissions = permissions;
    member.until_date = untilDate;
    return true;
  }

  /**
   * Unrestrict a member (restore default permissions).
   */
  unrestrict(chatId: number, userId: number): boolean {
    const member = this.getMember(chatId, userId);
    if (!member || member.status !== "restricted") return false;

    member.status = "member";
    member.restrictedPermissions = undefined;
    member.until_date = 0;
    return true;
  }

  /**
   * Ban a member from a chat.
   */
  ban(chatId: number, userId: number, untilDate: number = 0): boolean {
    const member = this.getMember(chatId, userId);
    if (!member) return false;
    if (member.status === "creator") return false;

    member.status = "kicked";
    member.until_date = untilDate;
    member.adminRights = undefined;
    member.custom_title = undefined;
    return true;
  }

  /**
   * Unban a member from a chat.
   */
  unban(chatId: number, userId: number): boolean {
    const member = this.getMember(chatId, userId);
    if (!member) return false;

    member.status = "left";
    member.until_date = 0;
    return true;
  }

  /**
   * Remove a member from a chat (they leave).
   */
  leave(chatId: number, userId: number): boolean {
    const member = this.getMember(chatId, userId);
    if (!member) return false;

    member.status = "left";
    return true;
  }

  /**
   * Check if a user is an admin (administrator or creator).
   */
  isAdmin(chatId: number, userId: number): boolean {
    const member = this.getMember(chatId, userId);
    if (!member) return false;
    return member.status === "administrator" || member.status === "creator";
  }

  /**
   * Check if a user is the owner (creator).
   */
  isOwner(chatId: number, userId: number): boolean {
    const member = this.getMember(chatId, userId);
    return member?.status === "creator";
  }

  /**
   * Check if a user has a specific admin right.
   */
  hasAdminRight(chatId: number, userId: number, right: keyof ChatAdministratorRights): boolean {
    const member = this.getMember(chatId, userId);
    if (!member) return false;
    if (member.status === "creator") return true;
    if (member.status !== "administrator") return false;
    return member.adminRights?.[right] ?? false;
  }

  /**
   * Check if a member can send messages.
   */
  canSendMessages(chatId: number, userId: number): boolean {
    const member = this.getMember(chatId, userId);
    if (!member) return false;

    // Admins and creator can always send
    if (member.status === "administrator" || member.status === "creator") {
      return true;
    }

    // Kicked/left members can't send
    if (member.status === "kicked" || member.status === "left") {
      return false;
    }

    // Restricted members check permissions
    if (member.status === "restricted") {
      // Check if restriction has expired
      if (member.until_date > 0 && member.until_date < this.timestamp()) {
        // Restriction expired, restore to member
        member.status = "member";
        member.restrictedPermissions = undefined;
        member.until_date = 0;
        return true;
      }
      return member.restrictedPermissions?.can_send_messages ?? false;
    }

    return true;
  }

  /**
   * Convert stored member to Telegram ChatMember type.
   */
  toChatMember(chatId: number, userId: number): ChatMember | undefined {
    const member = this.getMember(chatId, userId);
    if (!member) return undefined;

    switch (member.status) {
      case "creator":
        return {
          status: "creator",
          user: member.user,
          is_anonymous: member.is_anonymous,
          custom_title: member.custom_title,
        };

      case "administrator":
        return {
          status: "administrator",
          user: member.user,
          can_be_edited: true,
          is_anonymous: member.is_anonymous,
          custom_title: member.custom_title,
          can_manage_chat: member.adminRights?.can_manage_chat ?? false,
          can_delete_messages: member.adminRights?.can_delete_messages ?? false,
          can_manage_video_chats: member.adminRights?.can_manage_video_chats ?? false,
          can_restrict_members: member.adminRights?.can_restrict_members ?? false,
          can_promote_members: member.adminRights?.can_promote_members ?? false,
          can_change_info: member.adminRights?.can_change_info ?? false,
          can_invite_users: member.adminRights?.can_invite_users ?? false,
          can_post_stories: member.adminRights?.can_post_stories ?? false,
          can_edit_stories: member.adminRights?.can_edit_stories ?? false,
          can_delete_stories: member.adminRights?.can_delete_stories ?? false,
          can_pin_messages: member.adminRights?.can_pin_messages ?? false,
          can_manage_topics: member.adminRights?.can_manage_topics ?? false,
        };

      case "member":
        return {
          status: "member",
          user: member.user,
        };

      case "restricted":
        return {
          status: "restricted",
          user: member.user,
          is_member: true,
          can_send_messages: member.restrictedPermissions?.can_send_messages ?? false,
          can_send_audios: member.restrictedPermissions?.can_send_audios ?? false,
          can_send_documents: member.restrictedPermissions?.can_send_documents ?? false,
          can_send_photos: member.restrictedPermissions?.can_send_photos ?? false,
          can_send_videos: member.restrictedPermissions?.can_send_videos ?? false,
          can_send_video_notes: member.restrictedPermissions?.can_send_video_notes ?? false,
          can_send_voice_notes: member.restrictedPermissions?.can_send_voice_notes ?? false,
          can_send_polls: member.restrictedPermissions?.can_send_polls ?? false,
          can_send_other_messages: member.restrictedPermissions?.can_send_other_messages ?? false,
          can_add_web_page_previews:
            member.restrictedPermissions?.can_add_web_page_previews ?? false,
          can_change_info: member.restrictedPermissions?.can_change_info ?? false,
          can_invite_users: member.restrictedPermissions?.can_invite_users ?? false,
          can_pin_messages: member.restrictedPermissions?.can_pin_messages ?? false,
          can_manage_topics: member.restrictedPermissions?.can_manage_topics ?? false,
          until_date: member.until_date,
        };

      case "left":
        return {
          status: "left",
          user: member.user,
        };

      case "kicked":
        return {
          status: "kicked",
          user: member.user,
          until_date: member.until_date,
        };
    }
  }

  // === Rate Limiting ===

  /**
   * Get or create rate limit state for a chat.
   */
  private getRateLimit(chatId: number): RateLimitState {
    let state = this.rateLimits.get(chatId);
    if (!state) {
      state = {
        messagesThisSecond: 0,
        currentSecond: 0,
        messagesThisMinute: 0,
        currentMinute: 0,
      };
      this.rateLimits.set(chatId, state);
    }
    return state;
  }

  /**
   * Check and update rate limits for sending a message.
   * Returns { allowed: boolean, retryAfter?: number }
   */
  checkRateLimit(
    chatId: number,
    userId: number,
    chatType: string,
    slowModeDelay: number,
  ): { allowed: boolean; retryAfter?: number } {
    const now = this.timestamp();
    const state = this.getRateLimit(chatId);
    const member = this.getMember(chatId, userId);

    // Admins are exempt from slow mode
    if (member && (member.status === "administrator" || member.status === "creator")) {
      return { allowed: true };
    }

    // Check slow mode (group-specific per-user rate limit)
    if (slowModeDelay > 0 && member) {
      const timeSinceLastMessage = now - member.lastMessageTime;
      if (timeSinceLastMessage < slowModeDelay) {
        return {
          allowed: false,
          retryAfter: slowModeDelay - timeSinceLastMessage,
        };
      }
    }

    // Global rate limits
    // 30 messages per second to same chat
    const currentSecond = Math.floor(now);
    if (state.currentSecond !== currentSecond) {
      state.currentSecond = currentSecond;
      state.messagesThisSecond = 0;
    }

    if (state.messagesThisSecond >= 30) {
      return { allowed: false, retryAfter: 1 };
    }

    // 20 messages per minute in groups
    if (chatType === "group" || chatType === "supergroup") {
      const currentMinute = Math.floor(now / 60);
      if (state.currentMinute !== currentMinute) {
        state.currentMinute = currentMinute;
        state.messagesThisMinute = 0;
      }

      if (state.messagesThisMinute >= 20) {
        return { allowed: false, retryAfter: 60 - (now % 60) };
      }
    }

    // Update counters
    state.messagesThisSecond++;
    state.messagesThisMinute++;

    // Update member's last message time
    if (member) {
      member.lastMessageTime = now;
    }

    return { allowed: true };
  }

  /**
   * Reset rate limit state for a chat.
   */
  resetRateLimit(chatId: number): void {
    this.rateLimits.delete(chatId);
  }

  // === Profile Photos ===

  /**
   * Add a profile photo for a user.
   */
  addProfilePhoto(userId: number, width: number = 640, height: number = 640): PhotoSize[][] {
    const photos = this.profilePhotos.get(userId) || [];

    // Use a single base ID for this photo set, with separate unique IDs for each size
    const baseId = this.fileIdCounter++;
    const smallId = this.fileIdCounter++;
    const mediumId = this.fileIdCounter++;
    const largeId = this.fileIdCounter++;

    // Generate different sizes (like Telegram does)
    const sizes: PhotoSize[] = [
      {
        file_id: `profile_${userId}_${baseId}_small`,
        file_unique_id: `unique_${smallId}`,
        width: Math.round(width * 0.25),
        height: Math.round(height * 0.25),
        file_size: 5000,
      },
      {
        file_id: `profile_${userId}_${baseId}_medium`,
        file_unique_id: `unique_${mediumId}`,
        width: Math.round(width * 0.5),
        height: Math.round(height * 0.5),
        file_size: 15000,
      },
      {
        file_id: `profile_${userId}_${baseId}_large`,
        file_unique_id: `unique_${largeId}`,
        width,
        height,
        file_size: 50000,
      },
    ];

    // Add to the beginning (most recent first)
    photos.unshift(sizes);
    this.profilePhotos.set(userId, photos);

    return photos;
  }

  /**
   * Get profile photos for a user.
   */
  getProfilePhotos(
    userId: number,
    offset: number = 0,
    limit: number = 100,
  ): { total_count: number; photos: PhotoSize[][] } {
    const allPhotos = this.profilePhotos.get(userId) || [];
    const photos = allPhotos.slice(offset, offset + limit);

    return {
      total_count: allPhotos.length,
      photos,
    };
  }

  /**
   * Remove all profile photos for a user.
   */
  clearProfilePhotos(userId: number): void {
    this.profilePhotos.delete(userId);
  }

  // === Premium Status ===

  /**
   * Set premium status for a user (globally, not chat-specific).
   * This is tracked per user across all chats they're in.
   */
  setPremium(userId: number, isPremium: boolean): void {
    // Track premium status globally
    if (isPremium) {
      this.premiumUsers.add(userId);
    } else {
      this.premiumUsers.delete(userId);
    }

    // Update all existing member records for this user
    for (const [, chatMembers] of this.members) {
      const member = chatMembers.get(userId);
      if (member) {
        member.is_premium = isPremium;
        // Also update the user object to reflect premium status
        (member.user as { is_premium?: boolean }).is_premium = isPremium;
      }
    }
  }

  /**
   * Check if a user has premium status.
   */
  isPremium(userId: number): boolean {
    return this.premiumUsers.has(userId);
  }

  // === State Management ===

  /**
   * Reset all member state.
   */
  reset(): void {
    this.members.clear();
    this.rateLimits.clear();
    this.profilePhotos.clear();
    this.premiumUsers.clear();
    this.currentTime = Date.now();
    this.fileIdCounter = 1;
  }

  /**
   * Delete all members from a chat.
   */
  deleteChatMembers(chatId: number): void {
    this.members.delete(chatId);
    this.rateLimits.delete(chatId);
  }
}

/**
 * Create a new MemberState instance.
 */
export function createMemberState(): MemberState {
  return new MemberState();
}
