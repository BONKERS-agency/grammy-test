import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestBot } from "../src/index.js";

describe("Chat Boosts", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("boost simulation", () => {
    it("should simulate a chat boost", async () => {
      const user = testBot.createUser({ first_name: "Booster" });
      const channel = testBot.createChat({ type: "channel", title: "Test Channel" });

      const update = testBot.server.simulateChatBoost(channel, user, "premium");

      expect(update.chat_boost).toBeDefined();
      expect(update.chat_boost?.chat.id).toBe(channel.id);
      expect(update.chat_boost?.boost.source.source).toBe("premium");
    });

    it("should simulate a gift code boost", async () => {
      const user = testBot.createUser({ first_name: "Gifter" });
      const channel = testBot.createChat({ type: "channel", title: "Test Channel" });

      const update = testBot.server.simulateChatBoost(channel, user, "gift_code");

      expect(update.chat_boost?.boost.source.source).toBe("gift_code");
    });

    it("should simulate a giveaway boost", async () => {
      const user = testBot.createUser({ first_name: "Winner" });
      const channel = testBot.createChat({ type: "channel", title: "Test Channel" });

      const update = testBot.server.simulateChatBoost(channel, user, "giveaway");

      expect(update.chat_boost?.boost.source.source).toBe("giveaway");
    });

    it("should track boost count", async () => {
      const user1 = testBot.createUser({ first_name: "User1" });
      const user2 = testBot.createUser({ first_name: "User2" });
      const channel = testBot.createChat({ type: "channel", title: "Test Channel" });

      testBot.server.simulateChatBoost(channel, user1, "premium");
      testBot.server.simulateChatBoost(channel, user2, "premium");

      const boostCount = testBot.server.chatState.getBoostCount(channel.id);
      expect(boostCount).toBe(2);
    });
  });

  describe("boost removal", () => {
    it("should simulate a removed boost", async () => {
      const user = testBot.createUser({ first_name: "Booster" });
      const channel = testBot.createChat({ type: "channel", title: "Test Channel" });

      const boostUpdate = testBot.server.simulateChatBoost(channel, user, "premium");
      const boostId = boostUpdate.chat_boost?.boost.boost_id ?? "";

      const removeUpdate = testBot.server.simulateRemovedChatBoost(channel, boostId);

      expect(removeUpdate.removed_chat_boost).toBeDefined();
      expect(removeUpdate.removed_chat_boost?.boost_id).toBe(boostId);
      expect(testBot.server.chatState.getBoostCount(channel.id)).toBe(0);
    });

    it("should throw error for non-existent boost", async () => {
      const channel = testBot.createChat({ type: "channel", title: "Test Channel" });

      expect(() => {
        testBot.server.simulateRemovedChatBoost(channel, "non_existent_boost");
      }).toThrow("boost not found");
    });
  });

  describe("getUserChatBoosts API", () => {
    it("should return user boosts for a chat", async () => {
      const booster = testBot.createUser({ first_name: "Booster" });
      const channel = testBot.createChat({ type: "channel", title: "Test Channel" });

      testBot.server.simulateChatBoost(channel, booster, "premium");
      testBot.server.simulateChatBoost(channel, booster, "gift_code");

      testBot.command("boosts", async (ctx) => {
        const result = await ctx.api.getUserChatBoosts(channel.id, booster.id);
        await ctx.reply(`Boosts: ${result.boosts.length}`);
      });

      const user = testBot.createUser({ first_name: "Admin" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/boosts");
      expect(response.text).toBe("Boosts: 2");
    });

    it("should return empty array for user without boosts", async () => {
      const user = testBot.createUser({ first_name: "NonBooster" });
      const channel = testBot.createChat({ type: "channel", title: "Test Channel" });

      testBot.command("boosts", async (ctx) => {
        const result = await ctx.api.getUserChatBoosts(channel.id, user.id);
        await ctx.reply(`Boosts: ${result.boosts.length}`);
      });

      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/boosts");
      expect(response.text).toBe("Boosts: 0");
    });
  });

  describe("boost handling", () => {
    it("should handle chat_boost updates", async () => {
      let receivedBoost = false;

      testBot.on("chat_boost", async (ctx) => {
        receivedBoost = true;
        expect(ctx.chatBoost.boost.source.source).toBe("premium");
      });

      const user = testBot.createUser({ first_name: "Booster" });
      const channel = testBot.createChat({ type: "channel", title: "Test Channel" });

      const update = testBot.server.simulateChatBoost(channel, user, "premium");
      await testBot.handleUpdate(update);

      expect(receivedBoost).toBe(true);
    });

    it("should handle removed_chat_boost updates", async () => {
      let receivedRemoval = false;

      testBot.on("removed_chat_boost", async (ctx) => {
        receivedRemoval = true;
        expect(ctx.removedChatBoost.boost_id).toBeDefined();
      });

      const user = testBot.createUser({ first_name: "Booster" });
      const channel = testBot.createChat({ type: "channel", title: "Test Channel" });

      const boostUpdate = testBot.server.simulateChatBoost(channel, user, "premium");
      const boostId = boostUpdate.chat_boost?.boost.boost_id ?? "";

      const removeUpdate = testBot.server.simulateRemovedChatBoost(channel, boostId);
      await testBot.handleUpdate(removeUpdate);

      expect(receivedRemoval).toBe(true);
    });
  });
});
