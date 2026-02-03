import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRunner, createConcurrentSink } from "@grammyjs/runner";
import { TestBot } from "../src/index.js";
import type { Message } from "grammy/types";

describe("Runner Support", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  // Helper to get last text from server messages
  function getLastBotText(chatId: number): string | undefined {
    const messages = testBot.server.getBotMessages(chatId);
    const lastMsg = messages[messages.length - 1];
    return lastMsg && "text" in lastMsg ? (lastMsg as Message.TextMessage).text : undefined;
  }

  describe("TestUpdateSource", () => {
    it("should create a runner source", () => {
      const source = testBot.createRunnerSource();
      expect(source).toBeDefined();
      expect(source.isActive()).toBe(false);
    });

    it("should work with grammY runner", async () => {
      // Set up handler
      testBot.on("message:text", (ctx) => ctx.reply(`Echo: ${ctx.message.text}`));

      // Create source and sink
      const source = testBot.createRunnerSource();
      const sink = createConcurrentSink(
        { consume: (update) => testBot.handleUpdate(update) },
        async (err) => console.error(err)
      );

      // Create runner with our custom source
      const handle = createRunner(source, sink);
      handle.start();

      try {
        // Create test data
        const user = testBot.createUser({ first_name: "Alice" });
        const chat = testBot.createChat({ type: "private" });

        // Queue an update
        const update = testBot.server.updateFactory.createTextMessage(user, chat, "hello");
        source.push(update);

        // Wait for processing
        await source.waitForProcessing(2000);

        // Check the result using server state
        expect(getLastBotText(chat.id)).toBe("Echo: hello");
      } finally {
        // Always stop the runner
        await handle.stop();
      }
    });

    it("should handle multiple concurrent updates", async () => {
      const receivedMessages: string[] = [];

      testBot.on("message:text", async (ctx) => {
        // Simulate some async work
        await new Promise((resolve) => setTimeout(resolve, 10));
        receivedMessages.push(ctx.message.text);
        await ctx.reply(`Got: ${ctx.message.text}`);
      });

      const source = testBot.createRunnerSource();
      const sink = createConcurrentSink(
        { consume: (update) => testBot.handleUpdate(update) },
        async (err) => console.error(err)
      );
      const handle = createRunner(source, sink);
      handle.start();

      try {
        const user = testBot.createUser({ first_name: "Bob" });
        const chat = testBot.createChat({ type: "private" });

        // Queue multiple updates
        source.push(testBot.server.updateFactory.createTextMessage(user, chat, "one"));
        source.push(testBot.server.updateFactory.createTextMessage(user, chat, "two"));
        source.push(testBot.server.updateFactory.createTextMessage(user, chat, "three"));

        // Wait for all to be processed
        await source.waitForProcessing(2000);

        // All messages should have been received (order may vary due to concurrency)
        expect(receivedMessages).toHaveLength(3);
        expect(receivedMessages).toContain("one");
        expect(receivedMessages).toContain("two");
        expect(receivedMessages).toContain("three");
      } finally {
        await handle.stop();
      }
    });

    it("should handle commands through runner", async () => {
      testBot.command("start", (ctx) => ctx.reply("Welcome!"));
      testBot.command("help", (ctx) => ctx.reply("Help message"));

      const source = testBot.createRunnerSource();
      const sink = createConcurrentSink(
        { consume: (update) => testBot.handleUpdate(update) },
        async (err) => console.error(err)
      );
      const handle = createRunner(source, sink);
      handle.start();

      try {
        const user = testBot.createUser({ first_name: "Charlie" });
        const chat = testBot.createChat({ type: "private" });

        source.push(testBot.server.updateFactory.createCommand(user, chat, "/start"));
        source.push(testBot.server.updateFactory.createCommand(user, chat, "/help"));

        await source.waitForProcessing(2000);

        // Check via server state
        const messages = testBot.server.getBotMessages(chat.id);
        expect(messages).toHaveLength(2);

        const texts = messages
          .filter((m): m is Message.TextMessage => "text" in m)
          .map((m) => m.text);
        expect(texts).toContain("Welcome!");
        expect(texts).toContain("Help message");
      } finally {
        await handle.stop();
      }
    });
  });

  describe("processUpdatesConcurrently", () => {
    it("should process updates concurrently without runner", async () => {
      const processOrder: number[] = [];

      testBot.on("message:text", async (ctx) => {
        const num = parseInt(ctx.message.text, 10);
        // Simulate variable processing time
        await new Promise((resolve) => setTimeout(resolve, (5 - num) * 10));
        processOrder.push(num);
        await ctx.reply(`Processed: ${num}`);
      });

      const user = testBot.createUser({ first_name: "Dave" });
      const chat = testBot.createChat({ type: "private" });

      const updates = [
        testBot.server.updateFactory.createTextMessage(user, chat, "1"),
        testBot.server.updateFactory.createTextMessage(user, chat, "2"),
        testBot.server.updateFactory.createTextMessage(user, chat, "3"),
      ];

      const responses = await testBot.processUpdatesConcurrently(updates);

      expect(responses).toHaveLength(3);

      // All should have text
      for (const response of responses) {
        expect(response.text).toMatch(/Processed: \d/);
      }
    });

    it("should return individual responses for each update", async () => {
      testBot.on("message:text", (ctx) => ctx.reply(`Reply to: ${ctx.message.text}`));

      const user = testBot.createUser({ first_name: "Eve" });
      const chat = testBot.createChat({ type: "private" });

      const updates = [
        testBot.server.updateFactory.createTextMessage(user, chat, "first"),
        testBot.server.updateFactory.createTextMessage(user, chat, "second"),
      ];

      const responses = await testBot.processUpdatesConcurrently(updates);

      expect(responses[0].text).toBe("Reply to: first");
      expect(responses[1].text).toBe("Reply to: second");
    });
  });

  describe("error handling", () => {
    it("should handle errors in handlers gracefully", async () => {
      const errors: Error[] = [];

      testBot.on("message:text", async (ctx) => {
        if (ctx.message.text === "error") {
          throw new Error("Handler error!");
        }
        await ctx.reply(`Got: ${ctx.message.text}`);
      });

      const source = testBot.createRunnerSource();
      const sink = createConcurrentSink(
        { consume: (update) => testBot.handleUpdate(update) },
        async (err) => {
          errors.push(err.error);
        }
      );
      const handle = createRunner(source, sink);
      handle.start();

      try {
        const user = testBot.createUser({ first_name: "Frank" });
        const chat = testBot.createChat({ type: "private" });

        // Push a message that will cause an error
        source.push(testBot.server.updateFactory.createTextMessage(user, chat, "error"));
        // Push a message that should succeed
        source.push(testBot.server.updateFactory.createTextMessage(user, chat, "hello"));

        await source.waitForProcessing(2000);

        // Error handler should have been called
        expect(errors).toHaveLength(1);
        expect(errors[0].message).toBe("Handler error!");

        // The successful message should still be processed
        expect(getLastBotText(chat.id)).toBe("Got: hello");
      } finally {
        await handle.stop();
      }
    });
  });
});
