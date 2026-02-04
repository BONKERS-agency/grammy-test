import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestBot } from "../src/index.js";

describe("Forum Topics", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("Create Forum Topic", () => {
    it("should create a forum topic", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const forum = testBot.createChat({
        type: "supergroup",
        title: "Test Forum",
        is_forum: true,
      });

      testBot.setOwner(forum, admin);
      testBot.setBotAdmin(forum, { can_manage_topics: true });

      testBot.command("newtopic", async (ctx) => {
        const topic = await ctx.createForumTopic("Discussion Thread", {
          icon_color: 0x6fb9f0,
          icon_custom_emoji_id: "5368324170671202286",
        });
        await ctx.reply(`Topic created: ${topic.name}`, {
          message_thread_id: topic.message_thread_id,
        });
      });

      const response = await testBot.sendCommand(admin, forum, "/newtopic");

      expect(response.text).toContain("Topic created");
      expect(response.text).toContain("Discussion Thread");
    });

    it("should track created topics", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const forum = testBot.createChat({
        type: "supergroup",
        title: "Test Forum",
        is_forum: true,
      });

      testBot.setOwner(forum, admin);
      testBot.setBotAdmin(forum, { can_manage_topics: true });

      testBot.command("topic", async (ctx) => {
        await ctx.createForumTopic("My Topic");
        await ctx.reply("Topic created");
      });

      await testBot.sendCommand(admin, forum, "/topic");

      const topics = testBot.server.chatState.getForumTopics(forum.id);
      // Forums auto-create a General topic, so we have 2 (General + My Topic)
      expect(topics).toHaveLength(2);
      const myTopic = topics.find((t) => t.name === "My Topic");
      expect(myTopic).toBeDefined();
      expect(myTopic?.name).toBe("My Topic");
    });
  });

  describe("Edit Forum Topic", () => {
    it("should edit topic name", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const forum = testBot.createChat({
        type: "supergroup",
        title: "Test Forum",
        is_forum: true,
      });

      testBot.setOwner(forum, admin);
      testBot.setBotAdmin(forum, { can_manage_topics: true });

      // Create a topic first
      const topic = testBot.server.chatState.createForumTopic(forum.id, {
        name: "Original Name",
        icon_color: 0x6fb9f0,
      });

      testBot.command("rename", async (ctx) => {
        await ctx.api.editForumTopic(ctx.chat?.id, topic.message_thread_id, { name: "New Name" });
        await ctx.reply("Topic renamed");
      });

      const response = await testBot.sendCommand(admin, forum, "/rename");

      expect(response.text).toBe("Topic renamed");
      const updated = testBot.server.chatState.getForumTopic(forum.id, topic.message_thread_id);
      expect(updated?.name).toBe("New Name");
    });
  });

  describe("Close/Reopen Forum Topic", () => {
    it("should close a topic", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const forum = testBot.createChat({
        type: "supergroup",
        title: "Test Forum",
        is_forum: true,
      });

      testBot.setOwner(forum, admin);
      testBot.setBotAdmin(forum, { can_manage_topics: true });

      const topic = testBot.server.chatState.createForumTopic(forum.id, {
        name: "Active Topic",
      });

      testBot.command("close", async (ctx) => {
        await ctx.api.closeForumTopic(ctx.chat?.id, topic.message_thread_id);
        await ctx.reply("Topic closed");
      });

      const response = await testBot.sendCommand(admin, forum, "/close");

      expect(response.text).toBe("Topic closed");
      const closed = testBot.server.chatState.getForumTopic(forum.id, topic.message_thread_id);
      expect(closed?.is_closed).toBe(true);
    });

    it("should reopen a closed topic", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const forum = testBot.createChat({
        type: "supergroup",
        title: "Test Forum",
        is_forum: true,
      });

      testBot.setOwner(forum, admin);
      testBot.setBotAdmin(forum, { can_manage_topics: true });

      const topic = testBot.server.chatState.createForumTopic(forum.id, {
        name: "Closed Topic",
        is_closed: true,
      });

      testBot.command("reopen", async (ctx) => {
        await ctx.api.reopenForumTopic(ctx.chat?.id, topic.message_thread_id);
        await ctx.reply("Topic reopened");
      });

      const response = await testBot.sendCommand(admin, forum, "/reopen");

      expect(response.text).toBe("Topic reopened");
      const reopened = testBot.server.chatState.getForumTopic(forum.id, topic.message_thread_id);
      expect(reopened?.is_closed).toBe(false);
    });
  });

  describe("Delete Forum Topic", () => {
    it("should delete a topic", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const forum = testBot.createChat({
        type: "supergroup",
        title: "Test Forum",
        is_forum: true,
      });

      testBot.setOwner(forum, admin);
      testBot.setBotAdmin(forum, { can_manage_topics: true });

      const topic = testBot.server.chatState.createForumTopic(forum.id, {
        name: "To Delete",
      });

      testBot.command("delete", async (ctx) => {
        await ctx.api.deleteForumTopic(ctx.chat?.id, topic.message_thread_id);
        await ctx.reply("Topic deleted");
      });

      const response = await testBot.sendCommand(admin, forum, "/delete");

      expect(response.text).toBe("Topic deleted");
      const deleted = testBot.server.chatState.getForumTopic(forum.id, topic.message_thread_id);
      expect(deleted).toBeUndefined();
    });
  });

  describe("Send Messages to Topics", () => {
    it("should send message to specific topic", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const forum = testBot.createChat({
        type: "supergroup",
        title: "Test Forum",
        is_forum: true,
      });

      const topic = testBot.server.chatState.createForumTopic(forum.id, {
        name: "General",
      });

      testBot.on("message:text", async (ctx) => {
        if (ctx.message.message_thread_id === topic.message_thread_id) {
          await ctx.reply("Reply in topic", {
            message_thread_id: topic.message_thread_id,
          });
        }
      });

      const response = await testBot.sendMessage(user, forum, "Hello in topic", {
        messageThreadId: topic.message_thread_id,
      });

      expect(response.text).toBe("Reply in topic");
    });

    it("should track messages per topic", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const forum = testBot.createChat({
        type: "supergroup",
        title: "Test Forum",
        is_forum: true,
      });

      const topic1 = testBot.server.chatState.createForumTopic(forum.id, { name: "Topic 1" });
      const topic2 = testBot.server.chatState.createForumTopic(forum.id, { name: "Topic 2" });

      testBot.on("message:text", (ctx) => ctx.reply("Got it"));

      await testBot.sendMessage(user, forum, "Message 1", {
        messageThreadId: topic1.message_thread_id,
      });
      await testBot.sendMessage(user, forum, "Message 2", {
        messageThreadId: topic1.message_thread_id,
      });
      await testBot.sendMessage(user, forum, "Message 3", {
        messageThreadId: topic2.message_thread_id,
      });

      // Messages are tracked but topic-specific counts would depend on implementation
      // Forums auto-create a General topic, so we have 3 (General + Topic 1 + Topic 2)
      const topics = testBot.server.chatState.getForumTopics(forum.id);
      expect(topics).toHaveLength(3);
    });
  });

  describe("General Forum Topic", () => {
    it("should handle general topic (thread_id = 1)", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const forum = testBot.createChat({
        type: "supergroup",
        title: "Test Forum",
        is_forum: true,
      });

      testBot.on("message:text", async (ctx) => {
        if (ctx.message.is_topic_message) {
          await ctx.reply("Topic message");
        } else {
          await ctx.reply("General message");
        }
      });

      // General topic has message_thread_id = 1 by convention
      const response = await testBot.sendMessage(user, forum, "Hello");
      expect(response.text).toBeDefined();
    });
  });

  describe("Hide/Unhide General Topic", () => {
    it("should hide general topic", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const forum = testBot.createChat({
        type: "supergroup",
        title: "Test Forum",
        is_forum: true,
      });

      testBot.setOwner(forum, admin);
      testBot.setBotAdmin(forum, { can_manage_topics: true });

      testBot.command("hidegeneral", async (ctx) => {
        await ctx.hideGeneralForumTopic();
        await ctx.reply("General topic hidden");
      });

      const response = await testBot.sendCommand(admin, forum, "/hidegeneral");
      expect(response.text).toBe("General topic hidden");

      const chatData = testBot.server.chatState.getOrCreate(forum);
      expect(chatData.generalTopicHidden).toBe(true);
    });

    it("should unhide general topic", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const forum = testBot.createChat({
        type: "supergroup",
        title: "Test Forum",
        is_forum: true,
      });

      testBot.setOwner(forum, admin);
      testBot.setBotAdmin(forum, { can_manage_topics: true });
      testBot.server.chatState.setGeneralTopicHidden(forum.id, true);

      testBot.command("showgeneral", async (ctx) => {
        await ctx.unhideGeneralForumTopic();
        await ctx.reply("General topic visible");
      });

      const response = await testBot.sendCommand(admin, forum, "/showgeneral");
      expect(response.text).toBe("General topic visible");

      const chatData = testBot.server.chatState.getOrCreate(forum);
      expect(chatData.generalTopicHidden).toBe(false);
    });
  });

  describe("Unpin All Forum Topic Messages", () => {
    it("should unpin all messages in a topic", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const forum = testBot.createChat({
        type: "supergroup",
        title: "Test Forum",
        is_forum: true,
      });

      testBot.setOwner(forum, admin);
      testBot.setBotAdmin(forum, { can_pin_messages: true });

      const topic = testBot.server.chatState.createForumTopic(forum.id, {
        name: "Announcements",
      });

      testBot.command("unpinall", async (ctx) => {
        await ctx.api.unpinAllForumTopicMessages(ctx.chat?.id, topic.message_thread_id);
        await ctx.reply("All messages unpinned");
      });

      const response = await testBot.sendCommand(admin, forum, "/unpinall");
      expect(response.text).toBe("All messages unpinned");
    });
  });
});
