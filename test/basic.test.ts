import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestBot } from "../src/index.js";

describe("TestBot", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("basic messaging", () => {
    it("should capture sent messages", async () => {
      testBot.command("start", (ctx) => ctx.reply("Welcome!"));

      const user = testBot.createUser({ id: 1, first_name: "John" });
      const chat = testBot.createChat({ type: "private", id: 1 });

      const response = await testBot.sendCommand(user, chat, "/start");

      expect(response.text).toBe("Welcome!");
    });

    it("should handle text messages", async () => {
      testBot.on("message:text", (ctx) => ctx.reply(`You said: ${ctx.message.text}`));

      const user = testBot.createUser({ id: 2, first_name: "Jane" });
      const chat = testBot.createChat({ type: "private", id: 2 });

      const response = await testBot.sendMessage(user, chat, "Hello bot");

      expect(response.text).toBe("You said: Hello bot");
    });

    it("should track all API calls", async () => {
      testBot.command("multi", async (ctx) => {
        await ctx.reply("First");
        await ctx.reply("Second");
      });

      const user = testBot.createUser({ id: 3 });
      const chat = testBot.createChat({ type: "private", id: 3 });

      const response = await testBot.sendCommand(user, chat, "/multi");

      expect(response.messages).toHaveLength(2);
      expect(response.texts).toEqual(["First", "Second"]);
    });
  });

  describe("callback queries", () => {
    it("should handle button clicks", async () => {
      testBot.callbackQuery("subscribe", (ctx) => ctx.answerCallbackQuery("Subscribed!"));

      const user = testBot.createUser({ id: 4 });
      const chat = testBot.createChat({ type: "private", id: 4 });

      const response = await testBot.clickButton(user, chat, "subscribe");

      expect(response.callbackAnswer?.text).toBe("Subscribed!");
    });
  });

  describe("chat types", () => {
    it("should work with group chats", async () => {
      testBot.command("hello", (ctx) => ctx.reply(`Hello, ${ctx.chat.type}!`));

      const user = testBot.createUser({ id: 5 });
      const chat = testBot.createChat({ type: "group", id: -100, title: "Test Group" });

      const response = await testBot.sendCommand(user, chat, "/hello");

      expect(response.text).toBe("Hello, group!");
    });

    it("should work with supergroups", async () => {
      testBot.command("hello", (ctx) => ctx.reply(`Hello, ${ctx.chat.type}!`));

      const user = testBot.createUser({ id: 6 });
      const chat = testBot.createChat({ type: "supergroup", id: -200, title: "Test Supergroup" });

      const response = await testBot.sendCommand(user, chat, "/hello");

      expect(response.text).toBe("Hello, supergroup!");
    });
  });

  describe("state management", () => {
    it("should clear state between tests", async () => {
      testBot.command("ping", (ctx) => ctx.reply("pong"));

      const user = testBot.createUser({ id: 7 });
      const chat = testBot.createChat({ type: "private", id: 7 });

      const response = await testBot.sendCommand(user, chat, "/ping");
      expect(response.messages).toHaveLength(1);

      testBot.clear();
      // After clear, API calls are cleared
      const apiCalls = testBot.getApiCalls().filter((c) => c.method === "sendMessage");
      expect(apiCalls).toHaveLength(0);
    });
  });

  describe("BotResponse API", () => {
    it("should return BotResponse from sendCommand", async () => {
      testBot.command("test", (ctx) => ctx.reply("Test response"));

      const user = testBot.createUser({ first_name: "Alice" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/test");

      expect(response.text).toBe("Test response");
      expect(response.messages).toHaveLength(1);
    });

    it("should return BotResponse from sendMessage", async () => {
      testBot.on("message:text", (ctx) => ctx.reply(`Echo: ${ctx.message.text}`));

      const user = testBot.createUser({ first_name: "Bob" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendMessage(user, chat, "Hello");

      expect(response.text).toBe("Echo: Hello");
    });

    it("should capture multiple messages in response", async () => {
      testBot.command("multi", async (ctx) => {
        await ctx.reply("Line 1");
        await ctx.reply("Line 2");
        await ctx.reply("Line 3");
      });

      const user = testBot.createUser({ first_name: "Charlie" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/multi");

      expect(response.texts).toEqual(["Line 1", "Line 2", "Line 3"]);
      expect(response.text).toBe("Line 3"); // Last message
    });

    it("should capture inline keyboard in response", async () => {
      testBot.command("menu", (ctx) =>
        ctx.reply("Choose:", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Option A", callback_data: "a" }],
              [{ text: "Option B", callback_data: "b" }],
            ],
          },
        })
      );

      const user = testBot.createUser({ first_name: "Dave" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/menu");

      expect(response.keyboard?.inline).toHaveLength(2);
      expect(response.getInlineButton("Option A")).toBeDefined();
      expect(response.getInlineButton("Option A")?.callback_data).toBe("a");
    });

    it("should capture callback answer in response", async () => {
      testBot.callbackQuery("confirm", (ctx) => {
        ctx.answerCallbackQuery("Confirmed!");
        ctx.reply("Done");
      });

      const user = testBot.createUser({ first_name: "Eve" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.clickButton(user, chat, "confirm");

      expect(response.callbackAnswer?.text).toBe("Confirmed!");
      expect(response.text).toBe("Done");
    });
  });
});
