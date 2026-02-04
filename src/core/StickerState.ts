import type { Sticker, StickerSet } from "grammy/types";

/**
 * Stored sticker set data.
 */
export interface StoredStickerSet {
  name: string;
  title: string;
  sticker_type: "regular" | "mask" | "custom_emoji";
  stickers: Sticker[];
  thumbnail?: {
    file_id: string;
    file_unique_id: string;
    width: number;
    height: number;
  };
}

/**
 * Manages sticker sets and custom emoji stickers.
 */
export class StickerState {
  /** Sticker sets by name */
  private stickerSets = new Map<string, StoredStickerSet>();

  /** Custom emoji stickers by custom_emoji_id */
  private customEmojis = new Map<string, Sticker>();

  /** File ID counter */
  private fileIdCounter = 1;

  /**
   * Create a new sticker set.
   */
  createStickerSet(
    name: string,
    title: string,
    stickerType: "regular" | "mask" | "custom_emoji" = "regular",
    stickers: Array<{ emoji: string; width?: number; height?: number }> = [],
  ): StoredStickerSet {
    const stickerObjects: Sticker[] = stickers.map((s) => {
      const id = this.fileIdCounter++;
      return {
        file_id: `sticker_${name}_${id}`,
        file_unique_id: `unique_sticker_${id}`,
        type: stickerType,
        width: s.width ?? 512,
        height: s.height ?? 512,
        is_animated: false,
        is_video: false,
        emoji: s.emoji,
        set_name: name,
      };
    });

    const set: StoredStickerSet = {
      name,
      title,
      sticker_type: stickerType,
      stickers: stickerObjects,
    };

    this.stickerSets.set(name, set);

    // If custom emoji type, register each sticker
    if (stickerType === "custom_emoji") {
      for (const sticker of stickerObjects) {
        const customEmojiId = `custom_emoji_${this.fileIdCounter++}`;
        (sticker as { custom_emoji_id?: string }).custom_emoji_id = customEmojiId;
        this.customEmojis.set(customEmojiId, sticker);
      }
    }

    return set;
  }

  /**
   * Get a sticker set by name.
   */
  getStickerSet(name: string): StickerSet | undefined {
    const stored = this.stickerSets.get(name);
    if (!stored) return undefined;

    return {
      name: stored.name,
      title: stored.title,
      sticker_type: stored.sticker_type,
      stickers: stored.stickers,
      thumbnail: stored.thumbnail,
    };
  }

  /**
   * Check if a sticker set exists.
   */
  hasStickerSet(name: string): boolean {
    return this.stickerSets.has(name);
  }

  /**
   * Add a sticker to an existing set.
   */
  addStickerToSet(
    name: string,
    emoji: string,
    width: number = 512,
    height: number = 512,
  ): Sticker | undefined {
    const set = this.stickerSets.get(name);
    if (!set) return undefined;

    const id = this.fileIdCounter++;
    const sticker: Sticker = {
      file_id: `sticker_${name}_${id}`,
      file_unique_id: `unique_sticker_${id}`,
      type: set.sticker_type,
      width,
      height,
      is_animated: false,
      is_video: false,
      emoji,
      set_name: name,
    };

    set.stickers.push(sticker);

    if (set.sticker_type === "custom_emoji") {
      const customEmojiId = `custom_emoji_${this.fileIdCounter++}`;
      (sticker as { custom_emoji_id?: string }).custom_emoji_id = customEmojiId;
      this.customEmojis.set(customEmojiId, sticker);
    }

    return sticker;
  }

  /**
   * Delete a sticker set.
   */
  deleteStickerSet(name: string): boolean {
    const set = this.stickerSets.get(name);
    if (!set) return false;

    // Remove custom emojis if any
    if (set.sticker_type === "custom_emoji") {
      for (const sticker of set.stickers) {
        const customEmojiId = (sticker as { custom_emoji_id?: string }).custom_emoji_id;
        if (customEmojiId) {
          this.customEmojis.delete(customEmojiId);
        }
      }
    }

    this.stickerSets.delete(name);
    return true;
  }

  /**
   * Get custom emoji stickers by their IDs.
   */
  getCustomEmojiStickers(customEmojiIds: string[]): Sticker[] {
    const stickers: Sticker[] = [];
    for (const id of customEmojiIds) {
      const sticker = this.customEmojis.get(id);
      if (sticker) {
        stickers.push(sticker);
      }
    }
    return stickers;
  }

  /**
   * Register a custom emoji (for testing purposes).
   */
  registerCustomEmoji(customEmojiId: string, emoji: string): Sticker {
    const id = this.fileIdCounter++;
    const sticker: Sticker = {
      file_id: `custom_emoji_sticker_${id}`,
      file_unique_id: `unique_custom_emoji_${id}`,
      type: "custom_emoji",
      width: 100,
      height: 100,
      is_animated: false,
      is_video: false,
      emoji,
      custom_emoji_id: customEmojiId,
    };

    this.customEmojis.set(customEmojiId, sticker);
    return sticker;
  }

  /**
   * Get all sticker sets.
   */
  getAllStickerSets(): StoredStickerSet[] {
    return Array.from(this.stickerSets.values());
  }

  /**
   * Reset all sticker state.
   */
  reset(): void {
    this.stickerSets.clear();
    this.customEmojis.clear();
    this.fileIdCounter = 1;
  }
}

/**
 * Create a new StickerState instance.
 */
export function createStickerState(): StickerState {
  return new StickerState();
}
