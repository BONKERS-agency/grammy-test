import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestBot, type WorkerSimulator } from "../src/index.js";

/**
 * Tests for the WorkerSimulator which allows testing bots that delegate
 * processing to message queues like BullMQ.
 *
 * In this pattern:
 * 1. Bot handler receives an update
 * 2. Handler queues a job to BullMQ (instead of responding directly)
 * 3. BullMQ worker processes the job asynchronously
 * 4. Worker sends the response through the Telegram API
 */
describe("Worker/Queue Support", () => {
  let testBot: TestBot;
  let worker: WorkerSimulator;

  beforeEach(() => {
    testBot = new TestBot();
    worker = testBot.createWorkerSimulator();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("Basic Worker Operations", () => {
    it("should create a worker simulator", () => {
      expect(worker).toBeDefined();
      expect(worker.getPendingJobs()).toHaveLength(0);
    });

    it("should send message as worker (outside handler context)", async () => {
      testBot.createUser({ first_name: "Alice" });
      const chat = testBot.createChat({ type: "private" });

      // Worker sends a message directly (not from handler)
      const response = await worker.sendMessage(chat.id, "Hello from worker!");

      expect(response.text).toBe("Hello from worker!");
    });

    it("should send multiple messages as worker", async () => {
      testBot.createUser({ first_name: "Bob" });
      const chat = testBot.createChat({ type: "private" });

      const response = await worker.sendMessages(chat.id, [
        "Processing complete!",
        "Here are your results:",
        "Result 1, Result 2, Result 3",
      ]);

      expect(response.texts).toHaveLength(3);
      expect(response.texts[0]).toBe("Processing complete!");
      expect(response.texts[2]).toBe("Result 1, Result 2, Result 3");
    });

    it("should edit message as worker", async () => {
      const chat = testBot.createChat({ type: "private" });

      // First send a message to get a message ID
      const initial = await worker.sendMessage(chat.id, "Processing...");
      const messageId = initial.messages[0]?.message_id ?? 1;

      // Then edit it
      const response = await worker.editMessage(chat.id, messageId, "Done!");

      expect(response.editedText).toBe("Done!");
    });
  });

  describe("Queue and Process Pattern", () => {
    it("should queue a job for later processing", async () => {
      const user = testBot.createUser({ first_name: "Charlie" });
      const chat = testBot.createChat({ type: "private" });

      // Simulate a handler that queues a job
      const update = testBot.server.updateFactory.createTextMessage(user, chat, "process this");
      const job = worker.queueJob(update, chat.id, { text: "process this" });

      expect(job.id).toBe("job_1");
      expect(job.chatId).toBe(chat.id);
      expect(job.payload).toEqual({ text: "process this" });
      expect(job.queuedAt).toBeInstanceOf(Date);
      expect(job.processedAt).toBeUndefined();

      expect(worker.pendingCount).toBe(1);
      expect(worker.getPendingJobs()).toHaveLength(1);
    });

    it("should process queued job by ID", async () => {
      const user = testBot.createUser({ first_name: "Dave" });
      const chat = testBot.createChat({ type: "private" });

      // Queue a job
      const update = testBot.server.updateFactory.createTextMessage(user, chat, "hello");
      const job = worker.queueJob<{ text: string }>(update, chat.id, { text: "hello" });

      // Process the job
      const response = await worker.processQueuedJob(job.id, async (api, queuedJob) => {
        await api.sendMessage(queuedJob.chatId, `Processed: ${queuedJob.payload.text}`);
      });

      expect(response.text).toBe("Processed: hello");
      expect(worker.getJob(job.id)?.processedAt).toBeInstanceOf(Date);
      expect(worker.getPendingJobs()).toHaveLength(0);
      expect(worker.getCompletedJobs()).toHaveLength(1);
    });

    it("should process with custom worker function", async () => {
      const chat = testBot.createChat({ type: "private" });

      // Use processJob for custom processing
      const response = await worker.processJob(chat.id, async (api, chatId) => {
        await api.sendMessage(chatId, "Step 1 complete");
        await api.sendMessage(chatId, "Step 2 complete");
        await api.sendMessage(chatId, "All done!");
      });

      expect(response.texts).toHaveLength(3);
      expect(response.texts[2]).toBe("All done!");
    });
  });

  describe("BullMQ-style Integration Pattern", () => {
    /**
     * This test simulates a realistic BullMQ integration where:
     * 1. Bot handler receives message and queues to BullMQ
     * 2. Test simulates BullMQ worker picking up and processing the job
     * 3. Worker sends response back via Telegram API
     */
    it("should support full BullMQ-style flow", async () => {
      // Simulated BullMQ job queue
      const bullQueue: Array<{ chatId: number; data: unknown }> = [];

      // Setup handler that queues instead of responding directly
      testBot.on("message:text", async (ctx) => {
        // Instead of ctx.reply(), queue to BullMQ
        bullQueue.push({
          chatId: ctx.chat.id,
          data: {
            userId: ctx.from?.id,
            text: ctx.message.text,
            timestamp: Date.now(),
          },
        });
        // Note: No response sent by handler - worker will respond
      });

      const user = testBot.createUser({ first_name: "Eve" });
      const chat = testBot.createChat({ type: "private" });

      // Step 1: User sends message to bot (handler queues it)
      await testBot.sendMessage(user, chat, "Generate report for Q4");

      // Verify job was queued
      expect(bullQueue).toHaveLength(1);
      expect(bullQueue[0].chatId).toBe(chat.id);

      // Step 2: Simulate BullMQ worker processing
      const queuedJob = bullQueue[0];
      const response = await worker.processJob(queuedJob.chatId, async (api, chatId) => {
        const data = queuedJob.data as { text: string };

        // Worker does async processing
        await new Promise((r) => setTimeout(r, 10)); // Simulate work

        // Worker sends response
        await api.sendMessage(chatId, `Report generated for: ${data.text}`);
      });

      // Verify response
      expect(response.text).toBe("Report generated for: Generate report for Q4");
    });

    it("should handle multiple queued jobs in order", async () => {
      const chat = testBot.createChat({ type: "private" });
      const user = testBot.createUser({ first_name: "Frank" });

      // Queue multiple jobs
      const jobs = [
        worker.queueJob(
          testBot.server.updateFactory.createTextMessage(user, chat, "job1"),
          chat.id,
          { index: 1 },
        ),
        worker.queueJob(
          testBot.server.updateFactory.createTextMessage(user, chat, "job2"),
          chat.id,
          { index: 2 },
        ),
        worker.queueJob(
          testBot.server.updateFactory.createTextMessage(user, chat, "job3"),
          chat.id,
          { index: 3 },
        ),
      ];

      expect(worker.pendingCount).toBe(3);

      // Process jobs in order (like BullMQ FIFO)
      const results: string[] = [];
      for (const job of jobs) {
        await worker.processQueuedJob(job.id, async (api, queuedJob) => {
          results.push(`processed_${(queuedJob.payload as { index: number }).index}`);
          await api.sendMessage(
            queuedJob.chatId,
            `Done ${(queuedJob.payload as { index: number }).index}`,
          );
        });
      }

      expect(results).toEqual(["processed_1", "processed_2", "processed_3"]);
      expect(worker.pendingCount).toBe(0);
      expect(worker.getCompletedJobs()).toHaveLength(3);
    });

    it("should handle failed job gracefully", async () => {
      const chat = testBot.createChat({ type: "private" });
      const user = testBot.createUser({ first_name: "Grace" });

      const job = worker.queueJob(
        testBot.server.updateFactory.createTextMessage(user, chat, "will fail"),
        chat.id,
        { shouldFail: true },
      );

      // Job throws error during processing
      await expect(
        worker.processQueuedJob(job.id, async () => {
          throw new Error("Job failed!");
        }),
      ).rejects.toThrow("Job failed!");

      // Job should still be in queue (not marked as processed)
      expect(worker.getJob(job.id)?.processedAt).toBeUndefined();
    });

    it("should throw error for non-existent job", async () => {
      await expect(worker.processQueuedJob("non_existent_job", async () => {})).rejects.toThrow(
        "Job not found: non_existent_job",
      );
    });
  });

  describe("Worker Utilities", () => {
    it("should get all jobs", async () => {
      const chat = testBot.createChat({ type: "private" });
      const user = testBot.createUser({ first_name: "Harry" });

      worker.queueJob(testBot.server.updateFactory.createTextMessage(user, chat, "1"), chat.id);
      worker.queueJob(testBot.server.updateFactory.createTextMessage(user, chat, "2"), chat.id);

      expect(worker.getJobs()).toHaveLength(2);
    });

    it("should get specific job by ID", async () => {
      const chat = testBot.createChat({ type: "private" });
      const user = testBot.createUser({ first_name: "Ivy" });

      const job = worker.queueJob(
        testBot.server.updateFactory.createTextMessage(user, chat, "test"),
        chat.id,
        { key: "value" },
      );

      const retrieved = worker.getJob(job.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.payload).toEqual({ key: "value" });
    });

    it("should clear all jobs", async () => {
      const chat = testBot.createChat({ type: "private" });
      const user = testBot.createUser({ first_name: "Jack" });

      worker.queueJob(testBot.server.updateFactory.createTextMessage(user, chat, "1"), chat.id);
      worker.queueJob(testBot.server.updateFactory.createTextMessage(user, chat, "2"), chat.id);

      expect(worker.getJobs()).toHaveLength(2);

      worker.clear();

      expect(worker.getJobs()).toHaveLength(0);
      expect(worker.pendingCount).toBe(0);
    });
  });

  describe("Real-world Scenarios", () => {
    it("should handle async report generation", async () => {
      // Scenario: User requests a report, bot acknowledges immediately,
      // then worker generates and sends the report

      const chat = testBot.createChat({ type: "private" });
      const user = testBot.createUser({ first_name: "Kate" });

      // Handler acknowledges and queues
      testBot.command("report", async (ctx) => {
        await ctx.reply("Generating your report... Please wait.");
        // In real code: await queue.add('report', { userId: ctx.from.id })
      });

      // User triggers command
      const ackResponse = await testBot.sendCommand(user, chat, "/report");
      expect(ackResponse.text).toBe("Generating your report... Please wait.");

      // Worker generates report asynchronously
      const reportResponse = await worker.processJob(chat.id, async (api, chatId) => {
        // Simulate report generation
        await new Promise((r) => setTimeout(r, 10));
        await api.sendMessage(chatId, "📊 Your report is ready!");
        await api.sendMessage(chatId, "Revenue: $1,234,567\nUsers: 10,000\nGrowth: +15%");
      });

      expect(reportResponse.texts).toHaveLength(2);
      expect(reportResponse.texts[0]).toContain("report is ready");
    });

    it("should handle image processing worker", async () => {
      // Scenario: User sends image, handler queues for processing,
      // worker processes and sends result

      const chat = testBot.createChat({ type: "private" });
      testBot.createUser({ first_name: "Leo" });

      // Simulate receiving a photo (handler would queue for processing)
      // Then worker processes and responds
      const response = await worker.processJob(chat.id, async (api, chatId) => {
        await api.sendMessage(chatId, "Processing your image...");
        // Simulate image processing
        await new Promise((r) => setTimeout(r, 10));
        await api.sendMessage(chatId, "Analysis complete!");
        await api.sendMessage(chatId, "Objects detected: cat, chair, window");
      });

      expect(response.texts).toHaveLength(3);
      expect(response.texts[2]).toContain("Objects detected");
    });

    it("should handle notification worker", async () => {
      // Scenario: Scheduled worker sends notifications to multiple chats

      const chat1 = testBot.createChat({ type: "private" });
      const chat2 = testBot.createChat({ type: "private" });

      // Worker sends notifications to multiple users
      const response1 = await worker.sendMessage(chat1.id, "Daily reminder: Check your tasks!");
      const response2 = await worker.sendMessage(chat2.id, "Daily reminder: Check your tasks!");

      expect(response1.text).toBe("Daily reminder: Check your tasks!");
      expect(response2.text).toBe("Daily reminder: Check your tasks!");
    });
  });
});
