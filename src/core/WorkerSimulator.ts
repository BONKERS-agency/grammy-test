import type { Api } from "grammy";
import type { Update } from "grammy/types";
import { type BotResponse, createBotResponse } from "./BotResponse.js";
import type { TelegramServer } from "./TelegramServer.js";

/**
 * Represents a job that was delegated to a message queue.
 */
export interface QueuedJob<T = unknown> {
  /** Unique job ID */
  id: string;
  /** The original update that triggered this job */
  update: Update;
  /** Chat ID where the response should be sent */
  chatId: number;
  /** Custom payload attached to the job */
  payload: T;
  /** When the job was queued */
  queuedAt: Date;
  /** When the job was processed (if completed) */
  processedAt?: Date;
  /** Response from processing (if completed) */
  response?: BotResponse;
}

/**
 * Simulates a message queue worker for testing bots that delegate
 * processing to external workers.
 *
 * This allows testing patterns where:
 * 1. Bot handler receives an update
 * 2. Handler queues a job (instead of responding directly)
 * 3. A worker processes the job asynchronously
 * 4. Worker sends the response through the API
 *
 * @example
 * ```typescript
 * // In your bot handler
 * bot.on("message:text", async (ctx) => {
 *   // Queue the job instead of processing
 *   await queue.publish({ chatId: ctx.chat.id, text: ctx.message.text });
 * });
 *
 * // In your test
 * const worker = testBot.createWorkerSimulator();
 *
 * // Send a message (handler queues the job)
 * await testBot.sendMessage(user, chat, "process this");
 *
 * // Simulate worker processing and responding
 * const response = await worker.processJob(chat.id, async (api) => {
 *   await api.sendMessage(chat.id, "Processed!");
 * });
 *
 * expect(response.text).toBe("Processed!");
 * ```
 */
export class WorkerSimulator {
  private server: TelegramServer;
  private api: Api;
  private jobs: Map<string, QueuedJob> = new Map();
  private jobIdCounter = 1;

  constructor(server: TelegramServer, api: Api) {
    this.server = server;
    this.api = api;
  }

  /**
   * Queue a job for later processing.
   * Call this from your handler to simulate delegating to a message queue.
   */
  queueJob<T>(update: Update, chatId: number, payload?: T): QueuedJob<T> {
    const job: QueuedJob<T> = {
      id: `job_${this.jobIdCounter++}`,
      update,
      chatId,
      payload: payload as T,
      queuedAt: new Date(),
    };
    this.jobs.set(job.id, job);
    return job;
  }

  /**
   * Process a job by executing a worker function.
   * The worker function receives the API and can send messages.
   *
   * @param chatId The chat ID to respond to
   * @param worker Function that does the work and sends responses
   * @returns BotResponse containing all API calls made by the worker
   */
  async processJob(
    chatId: number,
    worker: (api: Api, chatId: number) => Promise<void>,
  ): Promise<BotResponse> {
    const response = createBotResponse();
    return this.server.runWithResponse(response, async () => {
      await worker(this.api, chatId);
      return response;
    });
  }

  /**
   * Process a queued job by ID.
   */
  async processQueuedJob(
    jobId: string,
    worker: (api: Api, job: QueuedJob) => Promise<void>,
  ): Promise<BotResponse> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const response = createBotResponse();
    return this.server.runWithResponse(response, async () => {
      await worker(this.api, job);
      job.processedAt = new Date();
      job.response = response;
      return response;
    });
  }

  /**
   * Send a message as a worker (outside of handler context).
   * This is the simplest way to simulate a worker response.
   */
  async sendMessage(
    chatId: number,
    text: string,
    options?: Parameters<Api["sendMessage"]>[2],
  ): Promise<BotResponse> {
    return this.processJob(chatId, async (api) => {
      await api.sendMessage(chatId, text, options);
    });
  }

  /**
   * Send multiple messages as a worker.
   */
  async sendMessages(chatId: number, texts: string[]): Promise<BotResponse> {
    return this.processJob(chatId, async (api) => {
      for (const text of texts) {
        await api.sendMessage(chatId, text);
      }
    });
  }

  /**
   * Edit a message as a worker.
   */
  async editMessage(
    chatId: number,
    messageId: number,
    text: string,
    options?: Parameters<Api["editMessageText"]>[3],
  ): Promise<BotResponse> {
    return this.processJob(chatId, async (api) => {
      await api.editMessageText(chatId, messageId, text, options);
    });
  }

  /**
   * Get all queued jobs.
   */
  getJobs(): QueuedJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get pending (unprocessed) jobs.
   */
  getPendingJobs(): QueuedJob[] {
    return this.getJobs().filter((j) => !j.processedAt);
  }

  /**
   * Get completed jobs.
   */
  getCompletedJobs(): QueuedJob[] {
    return this.getJobs().filter((j) => j.processedAt);
  }

  /**
   * Get a job by ID.
   */
  getJob(jobId: string): QueuedJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Clear all jobs.
   */
  clear(): void {
    this.jobs.clear();
  }

  /**
   * Get the number of pending jobs.
   */
  get pendingCount(): number {
    return this.getPendingJobs().length;
  }
}

/**
 * Create a worker simulator.
 */
export function createWorkerSimulator(server: TelegramServer, api: Api): WorkerSimulator {
  return new WorkerSimulator(server, api);
}
