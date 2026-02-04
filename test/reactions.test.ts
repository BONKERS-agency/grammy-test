import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestBot } from "../src/index.js";

describe("Message Reactions", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("Add Reactions", () => {
    it("should add emoji reaction to message", async () => {
      let reactionReceived = false;

      testBot.on("message_reaction", (ctx) => {
        reactionReceived = true;
        const newReactions = ctx.messageReaction.new_reaction;
        expect(newReactions).toHaveLength(1);
        expect(newReactions[0].type).toBe("emoji");
      });

      const user = testBot.createUser({ first_name: "Alice" });
      const chat = testBot.createChat({ type: "private" });

      // First send a message
      testBot.on("message:text", (ctx) => ctx.reply("Got it"));
      const msgResponse = await testBot.sendMessage(user, chat, "Hello");

      // Then react to it
      await testBot.react(user, chat, msgResponse.messages[0].message_id, [
        { type: "emoji", emoji: "👍" },
      ]);

      expect(reactionReceived).toBe(true);
    });

    it("should add multiple reactions", async () => {
      let reactionsCount = 0;

      testBot.on("message_reaction", (ctx) => {
        reactionsCount = ctx.messageReaction.new_reaction.length;
      });

      const user = testBot.createUser({ first_name: "Bob" });
      const chat = testBot.createChat({ type: "private" });

      testBot.on("message:text", (ctx) => ctx.reply("Message"));
      const msgResponse = await testBot.sendMessage(user, chat, "Test");

      await testBot.react(user, chat, msgResponse.messages[0].message_id, [
        { type: "emoji", emoji: "👍" },
        { type: "emoji", emoji: "❤️" },
        { type: "emoji", emoji: "🔥" },
      ]);

      expect(reactionsCount).toBe(3);
    });

    it("should add custom emoji reaction", async () => {
      let customEmojiId: string | undefined;

      testBot.on("message_reaction", (ctx) => {
        const reaction = ctx.messageReaction.new_reaction[0];
        if (reaction.type === "custom_emoji") {
          customEmojiId = reaction.custom_emoji_id;
        }
      });

      const user = testBot.createUser({ first_name: "Charlie" });
      const chat = testBot.createChat({ type: "private" });

      testBot.on("message:text", (ctx) => ctx.reply("Message"));
      const msgResponse = await testBot.sendMessage(user, chat, "Test");

      await testBot.react(user, chat, msgResponse.messages[0].message_id, [
        { type: "custom_emoji", custom_emoji_id: "5368324170671202286" },
      ]);

      expect(customEmojiId).toBe("5368324170671202286");
    });
  });

  describe("Change Reactions", () => {
    it("should change reaction on message", async () => {
      const reactionHistory: string[][] = [];

      testBot.on("message_reaction", (ctx) => {
        const emojis =
          ctx.messageReaction?.new_reaction
            .filter((r) => r.type === "emoji")
            .map((r) => (r as { type: "emoji"; emoji: string }).emoji) ?? [];
        reactionHistory.push(emojis);
      });

      const user = testBot.createUser({ first_name: "Dave" });
      const chat = testBot.createChat({ type: "private" });

      testBot.on("message:text", (ctx) => ctx.reply("Message"));
      const msgResponse = await testBot.sendMessage(user, chat, "Test");
      const messageId = msgResponse.messages[0].message_id;

      // First reaction
      await testBot.react(user, chat, messageId, [{ type: "emoji", emoji: "👍" }]);

      // Change reaction
      await testBot.react(user, chat, messageId, [{ type: "emoji", emoji: "❤️" }]);

      expect(reactionHistory).toHaveLength(2);
      expect(reactionHistory[0]).toEqual(["👍"]);
      expect(reactionHistory[1]).toEqual(["❤️"]);
    });
  });

  describe("Remove Reactions", () => {
    it("should remove all reactions", async () => {
      let finalReactionCount = 0;

      testBot.on("message_reaction", (ctx) => {
        finalReactionCount = ctx.messageReaction.new_reaction.length;
      });

      const user = testBot.createUser({ first_name: "Eve" });
      const chat = testBot.createChat({ type: "private" });

      testBot.on("message:text", (ctx) => ctx.reply("Message"));
      const msgResponse = await testBot.sendMessage(user, chat, "Test");
      const messageId = msgResponse.messages[0].message_id;

      // Add reaction
      await testBot.react(user, chat, messageId, [{ type: "emoji", emoji: "👍" }]);

      // Remove all reactions (empty array)
      await testBot.react(user, chat, messageId, []);

      expect(finalReactionCount).toBe(0);
    });
  });

  describe("Reaction Update Info", () => {
    it("should include old and new reactions", async () => {
      let oldReactions: Array<{ type: string }> = [];
      let newReactions: Array<{ type: string }> = [];

      testBot.on("message_reaction", (ctx) => {
        oldReactions = ctx.messageReaction.old_reaction;
        newReactions = ctx.messageReaction.new_reaction;
      });

      const user = testBot.createUser({ first_name: "Frank" });
      const chat = testBot.createChat({ type: "private" });

      testBot.on("message:text", (ctx) => ctx.reply("Message"));
      const msgResponse = await testBot.sendMessage(user, chat, "Test");
      const messageId = msgResponse.messages[0].message_id;

      // First reaction (old should be empty)
      await testBot.react(user, chat, messageId, [{ type: "emoji", emoji: "👍" }]);
      expect(oldReactions).toHaveLength(0);
      expect(newReactions).toHaveLength(1);

      // Second reaction (old should have previous)
      await testBot.react(user, chat, messageId, [{ type: "emoji", emoji: "❤️" }]);
      expect(oldReactions).toHaveLength(1);
      expect(newReactions).toHaveLength(1);
    });

    it("should include user info", async () => {
      let reactorId: number | undefined;

      testBot.on("message_reaction", (ctx) => {
        reactorId = ctx.messageReaction.user?.id;
      });

      const user = testBot.createUser({ first_name: "Grace", id: 12345 });
      const chat = testBot.createChat({ type: "private" });

      testBot.on("message:text", (ctx) => ctx.reply("Message"));
      const msgResponse = await testBot.sendMessage(user, chat, "Test");

      await testBot.react(user, chat, msgResponse.messages[0].message_id, [
        { type: "emoji", emoji: "👍" },
      ]);

      expect(reactorId).toBe(12345);
    });

    it("should include chat and message info", async () => {
      let chatId: number | undefined;
      let messageId: number | undefined;

      testBot.on("message_reaction", (ctx) => {
        chatId = ctx.messageReaction.chat.id;
        messageId = ctx.messageReaction.message_id;
      });

      const user = testBot.createUser({ first_name: "Harry" });
      const chat = testBot.createChat({ type: "private", id: 98765 });

      testBot.on("message:text", (ctx) => ctx.reply("Message"));
      const msgResponse = await testBot.sendMessage(user, chat, "Test");
      const expectedMessageId = msgResponse.messages[0].message_id;

      await testBot.react(user, chat, expectedMessageId, [{ type: "emoji", emoji: "👍" }]);

      expect(chatId).toBe(98765);
      expect(messageId).toBe(expectedMessageId);
    });
  });

  describe("Reaction Count Updates", () => {
    it("should trigger reaction count update in channels", async () => {
      let countUpdateReceived = false;
      let totalCount = 0;

      testBot.on("message_reaction_count", (ctx) => {
        countUpdateReceived = true;
        totalCount =
          ctx.messageReactionCount?.reactions.reduce((sum, r) => sum + r.total_count, 0) ?? 0;
      });

      const channel = testBot.createChat({ type: "channel", title: "Test Channel" });

      // Simulate reaction count update
      await testBot.simulateReactionCountUpdate(channel, 1, [
        { type: { type: "emoji", emoji: "👍" }, total_count: 5 },
        { type: { type: "emoji", emoji: "❤️" }, total_count: 3 },
      ]);

      expect(countUpdateReceived).toBe(true);
      expect(totalCount).toBe(8);
    });
  });

  describe("Bot Setting Reactions", () => {
    it("should set reaction on message via API", async () => {
      testBot.command("like", async (ctx) => {
        if (ctx.message?.reply_to_message) {
          await ctx.api.setMessageReaction(ctx.chat.id, ctx.message.reply_to_message.message_id, [
            { type: "emoji", emoji: "👍" },
          ]);
          await ctx.reply("Liked!");
        }
      });

      const user = testBot.createUser({ first_name: "Ivy" });
      const chat = testBot.createChat({ type: "private" });

      // Send a message to react to
      testBot.on("message:text", (ctx) => {
        if (!ctx.message.text.startsWith("/")) {
          ctx.reply("Got your message");
        }
      });

      const msgResponse = await testBot.sendMessage(user, chat, "React to this");
      expect(msgResponse.sentMessage).toBeDefined();
      const targetMessage = msgResponse.sentMessage;

      // Send command replying to that message
      const response = await testBot.sendCommand(user, chat, "/like", {
        replyToMessageId: targetMessage.message_id,
      });

      expect(response.text).toBe("Liked!");
    });
  });

  describe("Anonymous Reactions", () => {
    it("should handle anonymous reactions in groups", async () => {
      let isAnonymous = false;

      testBot.on("message_reaction", (ctx) => {
        // Anonymous reactions don't include user info
        isAnonymous = ctx.messageReaction.user === undefined;
      });

      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      // Simulate anonymous reaction
      await testBot.simulateAnonymousReaction(group, 1, [{ type: "emoji", emoji: "👍" }], []);

      expect(isAnonymous).toBe(true);
    });
  });

  describe("Available Reactions", () => {
    it("should respect chat available reactions", async () => {
      const group = testBot.createChat({ type: "supergroup", title: "Limited Reactions" });

      // Set available reactions for the chat
      testBot.server.chatState.setAvailableReactions(group.id, {
        type: "some",
        reactions: [
          { type: "emoji", emoji: "👍" },
          { type: "emoji", emoji: "👎" },
        ],
      });

      const chatData = testBot.server.chatState.getOrCreate(group);
      expect(chatData.availableReactions?.type).toBe("some");
    });
  });

  describe("Reaction Filtering", () => {
    it("should filter by specific emoji", async () => {
      let likeCount = 0;

      testBot.on("message_reaction", (ctx) => {
        const reactions = ctx.messageReaction.new_reaction;
        const likes = reactions.filter(
          (r) => r.type === "emoji" && (r as { type: "emoji"; emoji: string }).emoji === "👍",
        );
        likeCount = likes.length;
      });

      const user = testBot.createUser({ first_name: "Jack" });
      const chat = testBot.createChat({ type: "private" });

      testBot.on("message:text", (ctx) => ctx.reply("Message"));
      const msgResponse = await testBot.sendMessage(user, chat, "Test");

      await testBot.react(user, chat, msgResponse.messages[0].message_id, [
        { type: "emoji", emoji: "👍" },
        { type: "emoji", emoji: "❤️" },
      ]);

      expect(likeCount).toBe(1);
    });
  });

  describe("React to Bot Messages", () => {
    it("should handle reaction to bot's message", async () => {
      let reactionToBot = false;

      testBot.on("message_reaction", (_ctx) => {
        // Check if reaction is to a bot's message
        reactionToBot = true;
      });

      const user = testBot.createUser({ first_name: "Kate" });
      const chat = testBot.createChat({ type: "private" });

      // Bot sends a message
      testBot.command("post", async (ctx) => {
        await ctx.reply("React to me!");
      });

      const botResponse = await testBot.sendCommand(user, chat, "/post");
      const botMessageId = botResponse.messages[0].message_id;

      // User reacts to bot's message
      await testBot.react(user, chat, botMessageId, [{ type: "emoji", emoji: "❤️" }]);

      expect(reactionToBot).toBe(true);
    });

    it("should respond to specific reaction", async () => {
      testBot.on("message_reaction", async (ctx) => {
        const reactions = ctx.messageReaction.new_reaction;
        const hasHeart = reactions.some(
          (r) => r.type === "emoji" && (r as { type: "emoji"; emoji: string }).emoji === "❤️",
        );

        if (hasHeart) {
          await ctx.api.sendMessage(ctx.messageReaction.chat.id, "Thanks for the love!");
        }
      });

      const user = testBot.createUser({ first_name: "Leo" });
      const chat = testBot.createChat({ type: "private" });

      testBot.command("post", async (ctx) => {
        await ctx.reply("Like this!");
      });

      const botResponse = await testBot.sendCommand(user, chat, "/post");

      await testBot.react(user, chat, botResponse.messages[0].message_id, [
        { type: "emoji", emoji: "❤️" },
      ]);

      // Check that the thank you message was sent
      const apiCalls = testBot.getApiCalls();
      const sendMessageCalls = apiCalls.filter((c) => c.method === "sendMessage");
      const thankYouCall = sendMessageCalls.find((c) => c.payload?.text === "Thanks for the love!");
      expect(thankYouCall).toBeDefined();
    });
  });
});
