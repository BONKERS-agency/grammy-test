import type { Update } from "grammy/types";
import type { UpdateSource, UpdateSupplier } from "@grammyjs/runner";

// Compatible AbortSignal type that works with both native and polyfilled versions
interface CompatibleAbortSignal {
  readonly aborted: boolean;
  addEventListener(type: "abort", listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: "abort", listener: () => void): void;
}

/**
 * A test update supplier that provides updates from a queue.
 * Used internally by TestUpdateSource.
 */
export class TestUpdateSupplier implements UpdateSupplier<Update> {
  private updates: Update[] = [];
  private resolveWaiter: ((updates: Update[]) => void) | null = null;
  private closed = false;

  /**
   * Supply updates to the runner.
   * If updates are queued, returns them immediately.
   * Otherwise, waits for updates to be pushed or abort signal.
   */
  async supply(batchSize: number, signal: CompatibleAbortSignal): Promise<Update[]> {
    // If already aborted or closed, return empty
    if (signal.aborted || this.closed) {
      return [];
    }

    // If we have updates ready, return them
    if (this.updates.length > 0) {
      const batch = this.updates.splice(0, Math.min(batchSize, this.updates.length));
      return batch;
    }

    // Wait for updates or abort
    return new Promise<Update[]>((resolve) => {
      // Set up abort handler
      const onAbort = () => {
        this.resolveWaiter = null;
        resolve([]);
      };

      signal.addEventListener("abort", onAbort, { once: true });

      // Store the resolver so push() can call it
      this.resolveWaiter = (updates: Update[]) => {
        signal.removeEventListener("abort", onAbort);
        this.resolveWaiter = null;
        resolve(updates);
      };
    });
  }

  /**
   * Push a single update to be supplied.
   */
  push(update: Update): void {
    if (this.resolveWaiter) {
      // Someone is waiting - give them the update immediately
      const resolver = this.resolveWaiter;
      this.resolveWaiter = null;
      resolver([update]);
    } else {
      // Queue it for later
      this.updates.push(update);
    }
  }

  /**
   * Push multiple updates to be supplied.
   */
  pushBatch(updates: Update[]): void {
    if (updates.length === 0) return;

    if (this.resolveWaiter) {
      const resolver = this.resolveWaiter;
      this.resolveWaiter = null;
      resolver(updates);
    } else {
      this.updates.push(...updates);
    }
  }

  /**
   * Close the supplier, releasing any waiter.
   */
  close(): void {
    this.closed = true;
    if (this.resolveWaiter) {
      const resolver = this.resolveWaiter;
      this.resolveWaiter = null;
      resolver([]);
    }
  }

  /**
   * Reset the supplier for reuse.
   */
  reset(): void {
    this.updates = [];
    this.resolveWaiter = null;
    this.closed = false;
  }

  /**
   * Get the number of pending updates.
   */
  get pendingCount(): number {
    return this.updates.length;
  }

  /**
   * Check if supplier is closed.
   */
  get isClosed(): boolean {
    return this.closed;
  }
}

/**
 * A test update source for use with grammY runner.
 *
 * This allows testing bots that use `run(bot)` from @grammyjs/runner
 * by providing a controllable update source.
 *
 * @example
 * ```typescript
 * import { run } from "@grammyjs/runner";
 *
 * const source = testBot.createRunnerSource();
 * const handle = run(testBot, { source });
 *
 * // Queue updates
 * source.push(testBot.server.updateFactory.createTextMessage(user, chat, "hello"));
 *
 * // Wait for processing
 * await source.waitForProcessing();
 *
 * // Stop the runner
 * await handle.stop();
 * ```
 */
export class TestUpdateSource implements UpdateSource<Update> {
  private supplier: TestUpdateSupplier;
  private active = false;
  private pace = 100;
  private abortController: AbortController | null = null;
  private processedCount = 0;
  private pushedCount = 0;

  constructor(supplier?: TestUpdateSupplier) {
    this.supplier = supplier ?? new TestUpdateSupplier();
  }

  /**
   * Returns the async generator that yields update batches.
   */
  async *generator(): AsyncGenerator<Update[]> {
    this.active = true;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      while (!signal.aborted && !this.supplier.isClosed) {
        const updates = await this.supplier.supply(this.pace, signal);

        // Exit if we got aborted while waiting
        if (signal.aborted || this.supplier.isClosed) {
          break;
        }

        // Skip empty batches (shouldn't happen normally, but be safe)
        if (updates.length === 0) {
          continue;
        }

        yield updates;

        // Track processed updates
        this.processedCount += updates.length;
      }
    } finally {
      this.active = false;
      this.abortController = null;
    }
  }

  /**
   * Sets the maximal pace of the generator.
   */
  setGeneratorPace(pace: number): void {
    this.pace = pace;
  }

  /**
   * Returns whether the source is currently active.
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Closes the source, interrupting any pending request.
   */
  close(): void {
    this.active = false;
    this.supplier.close();
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Push a single update to the source.
   */
  push(update: Update): void {
    this.pushedCount++;
    this.supplier.push(update);
  }

  /**
   * Push multiple updates to the source.
   */
  pushBatch(updates: Update[]): void {
    this.pushedCount += updates.length;
    this.supplier.pushBatch(updates);
  }

  /**
   * Wait for all pushed updates to be processed.
   */
  async waitForProcessing(timeoutMs = 5000): Promise<void> {
    const startTime = Date.now();

    // Wait until all pushed updates have been processed
    while (this.processedCount < this.pushedCount) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(
          `Timeout waiting for updates. Pushed: ${this.pushedCount}, Processed: ${this.processedCount}`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Small delay to ensure handlers have completed
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  /**
   * Get the number of pending updates (not yet consumed by generator).
   */
  get pendingCount(): number {
    return this.supplier.pendingCount;
  }

  /**
   * Reset the source for reuse.
   */
  reset(): void {
    this.supplier.reset();
    this.processedCount = 0;
    this.pushedCount = 0;
  }

  /**
   * Get the underlying supplier (for advanced use cases).
   */
  getSupplier(): TestUpdateSupplier {
    return this.supplier;
  }
}

/**
 * Create a test update source for use with grammY runner.
 */
export function createTestUpdateSource(): TestUpdateSource {
  return new TestUpdateSource();
}
