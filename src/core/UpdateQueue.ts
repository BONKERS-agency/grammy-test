import type { Update } from "grammy/types";

/**
 * Waiter entry for pending getUpdates calls.
 */
interface Waiter {
  resolve: (updates: Update[]) => void;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * Simulates the Telegram update queue for long polling.
 *
 * When a bot calls `getUpdates`, Telegram either returns pending updates
 * immediately or holds the connection open until new updates arrive (long polling).
 *
 * This class provides:
 * - `push(update)` / `pushBatch(updates)` - Queue updates for delivery
 * - `getUpdates(offset, limit, timeout)` - Returns queued updates or waits
 * - `abort()` - Release all waiting getUpdates calls (used on bot.stop())
 */
export class UpdateQueue {
  private updates: Update[] = [];
  private waiters: Waiter[] = [];
  private aborted = false;
  private lastOffset = 0;

  /**
   * Push a single update to the queue.
   * Any pending getUpdates calls will receive this update.
   */
  push(update: Update): void {
    this.updates.push(update);
    this.notifyWaiters();
  }

  /**
   * Push multiple updates to the queue.
   */
  pushBatch(updates: Update[]): void {
    this.updates.push(...updates);
    this.notifyWaiters();
  }

  /**
   * Get updates from the queue.
   * This simulates the Telegram getUpdates long polling behavior.
   *
   * @param offset Only return updates with update_id >= offset (0 = all)
   * @param limit Maximum number of updates to return (1-100, default 100)
   * @param timeout Long polling timeout in seconds (0 = no wait, default 0)
   * @returns Array of updates
   */
  async getUpdates(
    offset: number = 0,
    limit: number = 100,
    timeout: number = 0,
  ): Promise<Update[]> {
    // If aborted, return empty immediately
    if (this.aborted) {
      return [];
    }

    // Apply offset - mark updates as "consumed"
    if (offset > 0 && offset > this.lastOffset) {
      this.lastOffset = offset;
      // Remove updates with update_id < offset
      this.updates = this.updates.filter((u) => u.update_id >= offset);
    }

    // Get available updates
    const available = this.getAvailableUpdates(offset, limit);

    if (available.length > 0 || timeout === 0) {
      return available;
    }

    // No updates available and timeout > 0 - wait for updates
    return new Promise((resolve) => {
      const waiter: Waiter = { resolve };

      // Set up timeout
      if (timeout > 0) {
        waiter.timer = setTimeout(() => {
          this.removeWaiter(waiter);
          // Return whatever updates are available now (might still be empty)
          resolve(this.getAvailableUpdates(offset, limit));
        }, timeout * 1000);
      }

      this.waiters.push(waiter);
    });
  }

  /**
   * Abort all pending getUpdates calls.
   * Call this when stopping the bot to release waiting connections.
   */
  abort(): void {
    this.aborted = true;

    // Release all waiters with empty arrays
    for (const waiter of this.waiters) {
      if (waiter.timer) {
        clearTimeout(waiter.timer);
      }
      waiter.resolve([]);
    }
    this.waiters = [];
  }

  /**
   * Reset the queue state.
   */
  reset(): void {
    this.updates = [];
    this.waiters = [];
    this.aborted = false;
    this.lastOffset = 0;
  }

  /**
   * Resume after abort (allows new getUpdates calls).
   */
  resume(): void {
    this.aborted = false;
  }

  /**
   * Get the number of pending updates.
   */
  get pendingCount(): number {
    return this.updates.length;
  }

  /**
   * Get the number of waiting getUpdates calls.
   */
  get waiterCount(): number {
    return this.waiters.length;
  }

  /**
   * Check if the queue has been aborted.
   */
  get isAborted(): boolean {
    return this.aborted;
  }

  /**
   * Get available updates respecting offset and limit.
   */
  private getAvailableUpdates(offset: number, limit: number): Update[] {
    let filtered = this.updates;

    if (offset > 0) {
      filtered = filtered.filter((u) => u.update_id >= offset);
    }

    return filtered.slice(0, Math.min(limit, 100));
  }

  /**
   * Notify waiters when new updates arrive.
   */
  private notifyWaiters(): void {
    if (this.waiters.length === 0 || this.updates.length === 0) {
      return;
    }

    // Get the first waiter
    const waiter = this.waiters.shift();
    if (!waiter) return;

    // Clear timeout
    if (waiter.timer) {
      clearTimeout(waiter.timer);
    }

    // Return all available updates (respecting default limit)
    const updates = this.getAvailableUpdates(this.lastOffset, 100);
    waiter.resolve(updates);
  }

  /**
   * Remove a waiter from the list.
   */
  private removeWaiter(waiter: Waiter): void {
    const index = this.waiters.indexOf(waiter);
    if (index !== -1) {
      this.waiters.splice(index, 1);
    }
  }
}

/**
 * Create a new UpdateQueue instance.
 */
export function createUpdateQueue(): UpdateQueue {
  return new UpdateQueue();
}
