import type { Message } from "grammy/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestBot } from "../src/index.js";

// Extended message type for web_app_data
type WebAppDataMessage = Message & {
  web_app_data?: {
    data: string;
    button_text: string;
  };
};

describe("Web App Support", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("web app data simulation", () => {
    it("should simulate web app data being sent", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      const update = testBot.server.simulateWebAppData(
        user,
        chat,
        "Submit Form",
        JSON.stringify({ name: "John", age: 30 }),
      );

      expect(update.message).toBeDefined();
      expect(update.message?.web_app_data).toBeDefined();
      expect(update.message?.web_app_data?.button_text).toBe("Submit Form");
      expect(update.message?.web_app_data?.data).toBe(JSON.stringify({ name: "John", age: 30 }));
    });

    it("should handle web_app_data in message handlers", async () => {
      let receivedData: string | undefined;
      let receivedButtonText: string | undefined;

      testBot.on("message:web_app_data", async (ctx) => {
        receivedData = ctx.msg.web_app_data?.data;
        receivedButtonText = ctx.msg.web_app_data?.button_text;
        await ctx.reply(`Received: ${receivedButtonText}`);
      });

      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      const update = testBot.server.simulateWebAppData(user, chat, "Submit", '{"key":"value"}');

      await testBot.handleUpdate(update);

      expect(receivedData).toBe('{"key":"value"}');
      expect(receivedButtonText).toBe("Submit");
    });

    it("should store web app message in chat history", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      testBot.server.simulateWebAppData(user, chat, "Button", "data");

      const messages = testBot.server.getAllMessages(chat.id);
      const webAppMessage = messages.find((m) => (m as WebAppDataMessage).web_app_data);

      expect(webAppMessage).toBeDefined();
      expect((webAppMessage as WebAppDataMessage).web_app_data?.data).toBe("data");
    });
  });

  describe("answerWebAppQuery", () => {
    it("should answer a web app query", async () => {
      testBot.command("webapp", async (ctx) => {
        const result = await ctx.api.answerWebAppQuery("query_123", {
          type: "article",
          id: "result_1",
          title: "Result",
          input_message_content: {
            message_text: "Web app result",
          },
        });
        await ctx.reply(`Inline message ID: ${result.inline_message_id}`);
      });

      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/webapp");

      expect(response.text).toContain("Inline message ID:");
      expect(response.text).toContain("webapp_result_");
    });

    it("should require web_app_query_id", async () => {
      testBot.command("webapp", async (ctx) => {
        await ctx.api.answerWebAppQuery("", {
          type: "article",
          id: "result_1",
          title: "Result",
          input_message_content: { message_text: "Test" },
        });
      });

      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      await expect(testBot.sendCommand(user, chat, "/webapp")).rejects.toThrow(
        /web_app_query_id is required/,
      );
    });
  });

  describe("web app data parsing", () => {
    it("should handle JSON data", async () => {
      let parsedData: unknown;

      testBot.on("message:web_app_data", async (ctx) => {
        try {
          parsedData = JSON.parse(ctx.msg.web_app_data?.data || "{}");
        } catch {
          parsedData = null;
        }
      });

      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      const update = testBot.server.simulateWebAppData(
        user,
        chat,
        "Submit",
        JSON.stringify({ items: [1, 2, 3], total: 100 }),
      );

      await testBot.handleUpdate(update);

      expect(parsedData).toEqual({ items: [1, 2, 3], total: 100 });
    });

    it("should handle plain text data", async () => {
      let receivedData: string | undefined;

      testBot.on("message:web_app_data", async (ctx) => {
        receivedData = ctx.msg.web_app_data?.data;
      });

      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      const update = testBot.server.simulateWebAppData(user, chat, "Plain", "just plain text");

      await testBot.handleUpdate(update);

      expect(receivedData).toBe("just plain text");
    });
  });
});
