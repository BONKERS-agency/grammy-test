import type { PassportElementError } from "grammy/types";

/**
 * Stored passport data for a user.
 */
export interface StoredPassportData {
  userId: number;
  data: Record<string, unknown>;
  credentials: Record<string, unknown>;
  errors: PassportElementError[];
}

/**
 * Manages Telegram Passport data.
 */
export class PassportState {
  /** Passport data by user ID */
  private passportData = new Map<number, StoredPassportData>();

  /**
   * Store passport data for a user.
   */
  setPassportData(
    userId: number,
    data: Record<string, unknown>,
    credentials: Record<string, unknown> = {},
  ): StoredPassportData {
    const stored: StoredPassportData = {
      userId,
      data,
      credentials,
      errors: [],
    };

    this.passportData.set(userId, stored);
    return stored;
  }

  /**
   * Get passport data for a user.
   */
  getPassportData(userId: number): StoredPassportData | undefined {
    return this.passportData.get(userId);
  }

  /**
   * Set passport data errors for a user.
   */
  setPassportDataErrors(userId: number, errors: PassportElementError[]): boolean {
    const data = this.passportData.get(userId);
    if (!data) {
      // Create a minimal entry if none exists
      this.passportData.set(userId, {
        userId,
        data: {},
        credentials: {},
        errors,
      });
      return true;
    }

    data.errors = errors;
    return true;
  }

  /**
   * Get passport data errors for a user.
   */
  getPassportDataErrors(userId: number): PassportElementError[] {
    return this.passportData.get(userId)?.errors ?? [];
  }

  /**
   * Clear passport data errors for a user.
   */
  clearPassportDataErrors(userId: number): void {
    const data = this.passportData.get(userId);
    if (data) {
      data.errors = [];
    }
  }

  /**
   * Check if a user has passport data.
   */
  hasPassportData(userId: number): boolean {
    return this.passportData.has(userId);
  }

  /**
   * Remove passport data for a user.
   */
  removePassportData(userId: number): boolean {
    return this.passportData.delete(userId);
  }

  /**
   * Reset all passport state.
   */
  reset(): void {
    this.passportData.clear();
  }
}

/**
 * Create a new PassportState instance.
 */
export function createPassportState(): PassportState {
  return new PassportState();
}
