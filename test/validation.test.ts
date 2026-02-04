import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestBot } from "../src/index.js";

describe("Validation", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("message length validation", () => {
    it("should reject messages longer than 4096 characters", async () => {
      testBot.command("send", async (ctx) => {
        await ctx.reply("A".repeat(4097));
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      await expect(testBot.sendCommand(user, chat, "/send")).rejects.toThrow(/message is too long/);
    });

    it("should accept messages exactly 4096 characters", async () => {
      testBot.command("send", async (ctx) => {
        await ctx.reply("A".repeat(4096));
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/send");

      expect(response.text).toBe("A".repeat(4096));
    });
  });

  describe("caption length validation", () => {
    it("should reject captions longer than 1024 characters", async () => {
      testBot.command("photo", async (ctx) => {
        await ctx.replyWithPhoto("https://example.com/photo.jpg", {
          caption: "A".repeat(1025),
        });
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      await expect(testBot.sendCommand(user, chat, "/photo")).rejects.toThrow(
        /caption is too long/,
      );
    });

    it("should accept captions exactly 1024 characters", async () => {
      testBot.command("photo", async (ctx) => {
        await ctx.replyWithPhoto("https://example.com/photo.jpg", {
          caption: "A".repeat(1024),
        });
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/photo");

      expect(response.messages[0]).toBeDefined();
    });
  });

  describe("file size validation", () => {
    it("should reject photos larger than 10MB", async () => {
      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      // Simulate sending a photo that's too large
      expect(() => {
        testBot.server.simulatePhotoMessage(user, chat, 800, 600, {
          fileSize: 11 * 1024 * 1024, // 11 MB
        });
      }).toThrow("file is too big");
    });

    it("should accept photos under 10MB", async () => {
      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      // Simulate sending a photo that's within limits
      const update = testBot.server.simulatePhotoMessage(user, chat, 800, 600, {
        fileSize: 5 * 1024 * 1024, // 5 MB
      });

      expect(update.message).toBeDefined();
    });

    it("should reject documents larger than 50MB", async () => {
      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      // Simulate sending a document that's too large
      expect(() => {
        testBot.server.simulateDocumentMessage(user, chat, "large.pdf", "application/pdf", {
          fileSize: 51 * 1024 * 1024, // 51 MB
        });
      }).toThrow("file is too big");
    });

    it("should accept documents under 50MB", async () => {
      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      // Simulate sending a document within limits
      const update = testBot.server.simulateDocumentMessage(
        user,
        chat,
        "doc.pdf",
        "application/pdf",
        {
          fileSize: 25 * 1024 * 1024, // 25 MB
        },
      );

      expect(update.message).toBeDefined();
    });
  });

  describe("message deletion time limits", () => {
    it("should require can_delete_messages for old messages in groups", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const user = testBot.createUser({ first_name: "User" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setMember(group, user);
      // Bot is admin without can_delete_messages
      testBot.setBotAdmin(group, { can_manage_chat: true });

      // User sends a message
      await testBot.sendMessage(user, group, "Hello");
      const userMessageId = testBot.server
        .getAllMessages(group.id)
        .find((m) => m.from?.id === user.id)?.message_id;

      // Advance time by 49 hours
      testBot.advanceTime(49 * 60 * 60);

      // Bot tries to delete the old message without can_delete_messages
      testBot.command("delete", async (ctx) => {
        await ctx.api.deleteMessage(group.id, userMessageId ?? 0);
      });

      await expect(testBot.sendCommand(admin, group, "/delete")).rejects.toThrow(
        /message can't be deleted for everyone/,
      );
    });

    it("should allow deleting old messages with can_delete_messages", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const user = testBot.createUser({ first_name: "User" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setMember(group, user);
      // Bot is admin with can_delete_messages
      testBot.setBotAdmin(group, { can_delete_messages: true });

      // User sends a message
      await testBot.sendMessage(user, group, "Hello");
      const userMessageId = testBot.server
        .getAllMessages(group.id)
        .find((m) => m.from?.id === user.id)?.message_id;

      // Advance time by 49 hours
      testBot.advanceTime(49 * 60 * 60);

      // Bot deletes the old message with permission
      testBot.command("delete", async (ctx) => {
        await ctx.api.deleteMessage(group.id, userMessageId ?? 0);
        await ctx.reply("Deleted");
      });

      const response = await testBot.sendCommand(admin, group, "/delete");

      expect(response.text).toBe("Deleted");
      expect(userMessageId).toBeDefined();
      expect(response.deletedMessageIds).toContain(userMessageId);
    });

    it("should allow deleting recent messages in groups with can_delete_messages", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const user = testBot.createUser({ first_name: "User" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setMember(group, user);
      // Bot is admin with can_delete_messages for any user message
      testBot.setBotAdmin(group, { can_delete_messages: true });

      // User sends a message
      await testBot.sendMessage(user, group, "Hello");
      const userMessageId = testBot.server
        .getAllMessages(group.id)
        .find((m) => m.from?.id === user.id)?.message_id;

      // Bot deletes the recent message
      testBot.command("delete", async (ctx) => {
        await ctx.api.deleteMessage(group.id, userMessageId ?? 0);
        await ctx.reply("Deleted");
      });

      const response = await testBot.sendCommand(admin, group, "/delete");

      expect(response.text).toBe("Deleted");
    });

    it("should allow deleting any message in private chats", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      // User sends a message
      await testBot.sendMessage(user, chat, "Hello");
      const userMessageId = testBot.server
        .getAllMessages(chat.id)
        .find((m) => m.from?.id === user.id)?.message_id;

      // Advance time by 49 hours
      testBot.advanceTime(49 * 60 * 60);

      // Bot deletes the message - should work even for old messages in private chats
      testBot.command("delete", async (ctx) => {
        await ctx.api.deleteMessage(chat.id, userMessageId ?? 0);
        await ctx.reply("Deleted");
      });

      const response = await testBot.sendCommand(user, chat, "/delete");

      expect(response.text).toBe("Deleted");
    });
  });

  describe("poll validation", () => {
    it("should require correct_option_id for quiz polls", async () => {
      testBot.command("quiz", async (ctx) => {
        await ctx.replyWithPoll("Question?", ["A", "B", "C"], {
          type: "quiz",
          // Missing correct_option_id
        });
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      await expect(testBot.sendCommand(user, chat, "/quiz")).rejects.toThrow(
        /quiz poll must have correct_option_id/,
      );
    });

    it("should reject invalid correct_option_id", async () => {
      testBot.command("quiz", async (ctx) => {
        await ctx.replyWithPoll("Question?", ["A", "B", "C"], {
          type: "quiz",
          correct_option_id: 5, // Invalid - only 3 options (0, 1, 2)
        });
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      await expect(testBot.sendCommand(user, chat, "/quiz")).rejects.toThrow(
        /QUIZ_CORRECT_OPTION_INVALID/,
      );
    });

    it("should reject negative correct_option_id", async () => {
      testBot.command("quiz", async (ctx) => {
        await ctx.replyWithPoll("Question?", ["A", "B", "C"], {
          type: "quiz",
          correct_option_id: -1,
        });
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      await expect(testBot.sendCommand(user, chat, "/quiz")).rejects.toThrow(
        /QUIZ_CORRECT_OPTION_INVALID/,
      );
    });

    it("should accept valid quiz poll", async () => {
      testBot.command("quiz", async (ctx) => {
        await ctx.replyWithPoll("What is 2+2?", ["3", "4", "5"], {
          type: "quiz",
          correct_option_id: 1,
        });
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/quiz");

      expect(response.poll).toBeDefined();
      expect(response.poll?.type).toBe("quiz");
      expect(response.poll?.correct_option_id).toBe(1);
    });

    it("should reject open_period greater than 600 seconds", async () => {
      testBot.command("poll", async (ctx) => {
        await ctx.replyWithPoll("Question?", ["A", "B"], {
          open_period: 601,
        });
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      await expect(testBot.sendCommand(user, chat, "/poll")).rejects.toThrow(
        /POLL_OPEN_PERIOD_TOO_LONG/,
      );
    });

    it("should accept open_period of 600 seconds", async () => {
      testBot.command("poll", async (ctx) => {
        await ctx.replyWithPoll("Question?", ["A", "B"], {
          open_period: 600,
        });
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/poll");

      expect(response.poll).toBeDefined();
    });

    it("should reject explanation longer than 200 characters", async () => {
      testBot.command("quiz", async (ctx) => {
        await ctx.replyWithPoll("Question?", ["A", "B"], {
          type: "quiz",
          correct_option_id: 0,
          explanation: "A".repeat(201),
        });
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      await expect(testBot.sendCommand(user, chat, "/quiz")).rejects.toThrow(
        /POLL_EXPLANATION_TOO_LONG/,
      );
    });

    it("should reject question longer than 300 characters", async () => {
      testBot.command("poll", async (ctx) => {
        await ctx.replyWithPoll("Q".repeat(301), ["A", "B"]);
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      await expect(testBot.sendCommand(user, chat, "/poll")).rejects.toThrow(
        /POLL_QUESTION_TOO_LONG/,
      );
    });

    it("should reject polls with fewer than 2 options", async () => {
      testBot.command("poll", async (ctx) => {
        await ctx.replyWithPoll("Question?", ["Only one"]);
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      await expect(testBot.sendCommand(user, chat, "/poll")).rejects.toThrow(
        /POLL_OPTIONS_COUNT_INVALID/,
      );
    });

    it("should reject polls with more than 10 options", async () => {
      testBot.command("poll", async (ctx) => {
        const options = Array.from({ length: 11 }, (_, i) => `Option ${i + 1}`);
        await ctx.replyWithPoll("Question?", options);
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      await expect(testBot.sendCommand(user, chat, "/poll")).rejects.toThrow(
        /POLL_OPTIONS_COUNT_INVALID/,
      );
    });

    it("should reject poll option longer than 100 characters", async () => {
      testBot.command("poll", async (ctx) => {
        await ctx.replyWithPoll("Question?", ["A".repeat(101), "B"]);
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      await expect(testBot.sendCommand(user, chat, "/poll")).rejects.toThrow(
        /POLL_OPTION_TOO_LONG/,
      );
    });

    it("should reject empty poll option", async () => {
      testBot.command("poll", async (ctx) => {
        await ctx.replyWithPoll("Question?", ["", "B"]);
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      await expect(testBot.sendCommand(user, chat, "/poll")).rejects.toThrow(/POLL_OPTION_EMPTY/);
    });

    it("should accept poll options at max length (100 characters)", async () => {
      testBot.command("poll", async (ctx) => {
        await ctx.replyWithPoll("Question?", ["A".repeat(100), "B".repeat(100)]);
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/poll");

      expect(response.poll).toBeDefined();
      expect(response.poll?.options[0].text).toBe("A".repeat(100));
    });
  });
});
