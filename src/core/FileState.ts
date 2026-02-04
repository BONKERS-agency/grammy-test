import type { Audio, Document, File, PhotoSize, Video, VideoNote, Voice } from "grammy/types";

/**
 * Type of stored file.
 */
export type FileType =
  | "photo"
  | "document"
  | "audio"
  | "video"
  | "voice"
  | "video_note"
  | "sticker"
  | "animation";

/**
 * Stored file data.
 */
export interface StoredFile {
  /** Unique file identifier */
  fileId: string;
  /** Unique identifier for this file (same across different bots) */
  fileUniqueId: string;
  /** File type */
  type: FileType;
  /** File size in bytes */
  fileSize?: number;
  /** MIME type */
  mimeType?: string;
  /** Original filename */
  fileName?: string;
  /** File content (for testing) */
  content?: Buffer | Uint8Array;
  /** Upload timestamp */
  uploadedAt: number;
  /** File path for getFile */
  filePath?: string;
  /** Width (for photos/videos) */
  width?: number;
  /** Height (for photos/videos) */
  height?: number;
  /** Duration (for audio/video/voice) */
  duration?: number;
  /** Thumbnail */
  thumbnail?: PhotoSize;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Manages file storage and file_id mapping.
 */
export class FileState {
  /** Map of fileId -> stored file data */
  private files = new Map<string, StoredFile>();

  /** Map of fileUniqueId -> fileId (for deduplication) */
  private uniqueIdToFileId = new Map<string, string>();

  /** Counter for generating unique file IDs */
  private fileIdCounter = 1;

  /** Base URL for file paths */
  private baseUrl = "https://api.telegram.org/file/bot";

  /**
   * Generate a unique file ID.
   */
  generateFileId(prefix: string = "file"): string {
    return `${prefix}_${this.fileIdCounter++}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Generate a unique file unique ID.
   */
  generateFileUniqueId(): string {
    return `unique_${this.fileIdCounter}_${Math.random().toString(36).slice(2, 10)}`;
  }

  // === File Storage ===

  /**
   * Store a file.
   */
  storeFile(
    type: FileType,
    options: {
      fileId?: string;
      fileUniqueId?: string;
      fileSize?: number;
      mimeType?: string;
      fileName?: string;
      content?: Buffer | Uint8Array;
      width?: number;
      height?: number;
      duration?: number;
      thumbnail?: PhotoSize;
      metadata?: Record<string, unknown>;
    } = {},
  ): StoredFile {
    const fileId = options.fileId ?? this.generateFileId(type);
    const fileUniqueId = options.fileUniqueId ?? this.generateFileUniqueId();

    const stored: StoredFile = {
      fileId,
      fileUniqueId,
      type,
      fileSize: options.fileSize ?? options.content?.length,
      mimeType: options.mimeType,
      fileName: options.fileName,
      content: options.content,
      uploadedAt: Math.floor(Date.now() / 1000),
      filePath: `${type}s/${fileId}`,
      width: options.width,
      height: options.height,
      duration: options.duration,
      thumbnail: options.thumbnail,
      metadata: options.metadata,
    };

    this.files.set(fileId, stored);
    this.uniqueIdToFileId.set(fileUniqueId, fileId);

    return stored;
  }

  /**
   * Store a photo (creates multiple sizes).
   */
  storePhoto(
    width: number,
    height: number,
    options: {
      content?: Buffer | Uint8Array;
      fileSize?: number;
    } = {},
  ): PhotoSize[] {
    const sizes: PhotoSize[] = [];
    const baseFileId = this.generateFileId("photo");

    // Thumbnail (90px on longest side)
    const thumbScale = Math.min(90 / Math.max(width, height), 1);
    const thumbWidth = Math.round(width * thumbScale);
    const thumbHeight = Math.round(height * thumbScale);

    const thumbFile = this.storeFile("photo", {
      fileId: `${baseFileId}_thumb`,
      width: thumbWidth,
      height: thumbHeight,
      fileSize: options.fileSize
        ? Math.round(options.fileSize * thumbScale * thumbScale)
        : undefined,
    });

    sizes.push({
      file_id: thumbFile.fileId,
      file_unique_id: thumbFile.fileUniqueId,
      width: thumbWidth,
      height: thumbHeight,
      file_size: thumbFile.fileSize,
    });

    // Medium size (320px on longest side)
    if (Math.max(width, height) > 320) {
      const medScale = 320 / Math.max(width, height);
      const medWidth = Math.round(width * medScale);
      const medHeight = Math.round(height * medScale);

      const medFile = this.storeFile("photo", {
        fileId: `${baseFileId}_med`,
        width: medWidth,
        height: medHeight,
        fileSize: options.fileSize ? Math.round(options.fileSize * medScale * medScale) : undefined,
      });

      sizes.push({
        file_id: medFile.fileId,
        file_unique_id: medFile.fileUniqueId,
        width: medWidth,
        height: medHeight,
        file_size: medFile.fileSize,
      });
    }

    // Large size (800px on longest side)
    if (Math.max(width, height) > 800) {
      const largeScale = 800 / Math.max(width, height);
      const largeWidth = Math.round(width * largeScale);
      const largeHeight = Math.round(height * largeScale);

      const largeFile = this.storeFile("photo", {
        fileId: `${baseFileId}_large`,
        width: largeWidth,
        height: largeHeight,
        fileSize: options.fileSize
          ? Math.round(options.fileSize * largeScale * largeScale)
          : undefined,
      });

      sizes.push({
        file_id: largeFile.fileId,
        file_unique_id: largeFile.fileUniqueId,
        width: largeWidth,
        height: largeHeight,
        file_size: largeFile.fileSize,
      });
    }

    // Original size
    const origFile = this.storeFile("photo", {
      fileId: baseFileId,
      width,
      height,
      fileSize: options.fileSize,
      content: options.content,
    });

    sizes.push({
      file_id: origFile.fileId,
      file_unique_id: origFile.fileUniqueId,
      width,
      height,
      file_size: origFile.fileSize,
    });

    return sizes;
  }

  /**
   * Store a document.
   */
  storeDocument(
    fileName: string,
    mimeType: string,
    options: {
      content?: Buffer | Uint8Array;
      fileSize?: number;
      thumbnail?: PhotoSize;
    } = {},
  ): Document {
    const file = this.storeFile("document", {
      fileName,
      mimeType,
      ...options,
    });

    return {
      file_id: file.fileId,
      file_unique_id: file.fileUniqueId,
      file_name: fileName,
      mime_type: mimeType,
      file_size: file.fileSize,
      thumbnail: options.thumbnail,
    };
  }

  /**
   * Store an audio file.
   */
  storeAudio(
    duration: number,
    options: {
      performer?: string;
      title?: string;
      fileName?: string;
      mimeType?: string;
      content?: Buffer | Uint8Array;
      fileSize?: number;
      thumbnail?: PhotoSize;
    } = {},
  ): Audio {
    const file = this.storeFile("audio", {
      duration,
      fileName: options.fileName,
      mimeType: options.mimeType ?? "audio/mpeg",
      content: options.content,
      fileSize: options.fileSize,
      thumbnail: options.thumbnail,
      metadata: { performer: options.performer, title: options.title },
    });

    return {
      file_id: file.fileId,
      file_unique_id: file.fileUniqueId,
      duration,
      performer: options.performer,
      title: options.title,
      file_name: options.fileName,
      mime_type: options.mimeType ?? "audio/mpeg",
      file_size: file.fileSize,
      thumbnail: options.thumbnail,
    };
  }

  /**
   * Store a video file.
   */
  storeVideo(
    width: number,
    height: number,
    duration: number,
    options: {
      fileName?: string;
      mimeType?: string;
      content?: Buffer | Uint8Array;
      fileSize?: number;
      thumbnail?: PhotoSize;
    } = {},
  ): Video {
    const file = this.storeFile("video", {
      width,
      height,
      duration,
      fileName: options.fileName,
      mimeType: options.mimeType ?? "video/mp4",
      content: options.content,
      fileSize: options.fileSize,
      thumbnail: options.thumbnail,
    });

    return {
      file_id: file.fileId,
      file_unique_id: file.fileUniqueId,
      width,
      height,
      duration,
      file_name: options.fileName,
      mime_type: options.mimeType ?? "video/mp4",
      file_size: file.fileSize,
      thumbnail: options.thumbnail,
    };
  }

  /**
   * Store a voice message.
   */
  storeVoice(
    duration: number,
    options: {
      mimeType?: string;
      content?: Buffer | Uint8Array;
      fileSize?: number;
    } = {},
  ): Voice {
    const file = this.storeFile("voice", {
      duration,
      mimeType: options.mimeType ?? "audio/ogg",
      content: options.content,
      fileSize: options.fileSize,
    });

    return {
      file_id: file.fileId,
      file_unique_id: file.fileUniqueId,
      duration,
      mime_type: options.mimeType ?? "audio/ogg",
      file_size: file.fileSize,
    };
  }

  /**
   * Store a video note (round video).
   */
  storeVideoNote(
    length: number,
    duration: number,
    options: {
      content?: Buffer | Uint8Array;
      fileSize?: number;
      thumbnail?: PhotoSize;
    } = {},
  ): VideoNote {
    const file = this.storeFile("video_note", {
      width: length,
      height: length,
      duration,
      content: options.content,
      fileSize: options.fileSize,
      thumbnail: options.thumbnail,
    });

    return {
      file_id: file.fileId,
      file_unique_id: file.fileUniqueId,
      length,
      duration,
      file_size: file.fileSize,
      thumbnail: options.thumbnail,
    };
  }

  // === File Retrieval ===

  /**
   * Get a file by ID.
   */
  getFile(fileId: string): StoredFile | undefined {
    return this.files.get(fileId);
  }

  /**
   * Get a file by unique ID.
   */
  getFileByUniqueId(fileUniqueId: string): StoredFile | undefined {
    const fileId = this.uniqueIdToFileId.get(fileUniqueId);
    return fileId ? this.files.get(fileId) : undefined;
  }

  /**
   * Get file info in Telegram API format.
   */
  getFileInfo(fileId: string): File | undefined {
    const stored = this.files.get(fileId);
    if (!stored) return undefined;

    return {
      file_id: stored.fileId,
      file_unique_id: stored.fileUniqueId,
      file_size: stored.fileSize,
      file_path: stored.filePath,
    };
  }

  /**
   * Get file content.
   */
  getFileContent(fileId: string): Buffer | Uint8Array | undefined {
    return this.files.get(fileId)?.content;
  }

  /**
   * Check if a file exists.
   */
  hasFile(fileId: string): boolean {
    return this.files.has(fileId);
  }

  // === File Management ===

  /**
   * Delete a file.
   */
  deleteFile(fileId: string): boolean {
    const stored = this.files.get(fileId);
    if (!stored) return false;

    this.uniqueIdToFileId.delete(stored.fileUniqueId);
    return this.files.delete(fileId);
  }

  /**
   * Get all stored files.
   */
  getAllFiles(): StoredFile[] {
    return Array.from(this.files.values());
  }

  /**
   * Get files by type.
   */
  getFilesByType(type: FileType): StoredFile[] {
    return this.getAllFiles().filter((f) => f.type === type);
  }

  /**
   * Get total storage used.
   */
  getTotalStorageUsed(): number {
    let total = 0;
    for (const file of this.files.values()) {
      total += file.fileSize ?? 0;
    }
    return total;
  }

  // === State Management ===

  /**
   * Reset all file state.
   */
  reset(): void {
    this.files.clear();
    this.uniqueIdToFileId.clear();
    this.fileIdCounter = 1;
  }

  /**
   * Set the base URL for file paths.
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  /**
   * Get the full URL for a file.
   */
  getFileUrl(fileId: string, botToken: string): string | undefined {
    const stored = this.files.get(fileId);
    if (!stored?.filePath) return undefined;
    return `${this.baseUrl}${botToken}/${stored.filePath}`;
  }
}

/**
 * Create a new FileState instance.
 */
export function createFileState(): FileState {
  return new FileState();
}
