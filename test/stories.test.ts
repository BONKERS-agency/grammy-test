import type { Chat, Message } from "grammy/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestBot } from "../src/index.js";

// Extended message type for story feature
type StoryMessage = Message & {
  story?: {
    id: number;
    chat: Chat;
  };
};

describe("Story Support", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("story message simulation", () => {
    it("should simulate a forwarded story message", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });
      const storyChat = testBot.createChat({ type: "channel", title: "Story Channel" });

      const update = testBot.server.simulateStoryMessage(user, chat, 123, storyChat);

      expect(update.message).toBeDefined();
      const msg = update.message as StoryMessage;
      expect(msg.story).toBeDefined();
      expect(msg.story?.id).toBe(123);
      expect(msg.story?.chat.id).toBe(storyChat.id);
    });

    it("should set correct message fields", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });
      const storyChat = testBot.createChat({ type: "channel", title: "News Channel" });

      const update = testBot.server.simulateStoryMessage(user, chat, 456, storyChat);

      expect(update.message?.from).toEqual(user);
      expect(update.message?.chat).toEqual(chat);
      expect(update.message?.message_id).toBeDefined();
      expect(update.message?.date).toBeDefined();
    });

    it("should store message in chat state", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });
      const storyChat = testBot.createChat({ type: "channel", title: "Channel" });

      const update = testBot.server.simulateStoryMessage(user, chat, 789, storyChat);
      const messageId = update.message?.message_id ?? 0;

      const storedMessage = testBot.server.chatState.getMessage(chat.id, messageId) as StoryMessage;
      expect(storedMessage).toBeDefined();
      expect(storedMessage?.story?.id).toBe(789);
    });
  });

  describe("story message handling", () => {
    it("should handle story messages in bot handlers", async () => {
      let receivedStory = false;
      let storyId: number | undefined;

      testBot.on("message", async (ctx) => {
        const msg = ctx.msg as StoryMessage;
        if (msg.story) {
          receivedStory = true;
          storyId = msg.story.id;
        }
      });

      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });
      const storyChat = testBot.createChat({ type: "channel", title: "Channel" });

      const update = testBot.server.simulateStoryMessage(user, chat, 999, storyChat);
      await testBot.handleUpdate(update);

      expect(receivedStory).toBe(true);
      expect(storyId).toBe(999);
    });

    it("should work with different story chat types", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      // Story from user's own story
      const userStoryChat = testBot.createChat({ type: "private" });
      const update1 = testBot.server.simulateStoryMessage(user, chat, 1, userStoryChat);
      expect((update1.message as StoryMessage).story?.chat.type).toBe("private");

      // Story from a channel
      const channelStoryChat = testBot.createChat({ type: "channel", title: "Channel" });
      const update2 = testBot.server.simulateStoryMessage(user, chat, 2, channelStoryChat);
      expect((update2.message as StoryMessage).story?.chat.type).toBe("channel");
    });

    it("should increment update and message IDs", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });
      const storyChat = testBot.createChat({ type: "channel", title: "Channel" });

      const update1 = testBot.server.simulateStoryMessage(user, chat, 1, storyChat);
      const update2 = testBot.server.simulateStoryMessage(user, chat, 2, storyChat);

      expect(update2.update_id).toBeGreaterThan(update1.update_id);
      expect(update2.message?.message_id).toBeGreaterThan(update1.message?.message_id ?? 0);
    });
  });

  describe("story integration", () => {
    it("should allow replying to story messages", async () => {
      let replySent = false;
      let replyText = "";

      testBot.on("message", async (ctx) => {
        if ((ctx.msg as StoryMessage).story) {
          const result = await ctx.reply("Nice story!");
          replySent = true;
          replyText = result.text || "";
        }
      });

      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });
      const storyChat = testBot.createChat({ type: "channel", title: "Channel" });

      const update = testBot.server.simulateStoryMessage(user, chat, 123, storyChat);
      await testBot.handleUpdate(update);

      expect(replySent).toBe(true);
      expect(replyText).toBe("Nice story!");
    });
  });
});
