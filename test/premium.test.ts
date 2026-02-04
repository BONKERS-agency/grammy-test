import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestBot } from "../src/index.js";

describe("Premium Features", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("premium status tracking", () => {
    it("should track premium status for a user", async () => {
      const user = testBot.createUser({ first_name: "Premium", is_premium: true });
      const chat = testBot.createChat({ type: "private" });

      testBot.setMember(chat, user);

      // Verify premium status through member state
      const isPremium = testBot.server.memberState.isPremium(user.id);
      expect(isPremium).toBe(false); // Default is false until explicitly set

      // Set premium status
      testBot.server.memberState.setPremium(user.id, true);

      const isPremiumNow = testBot.server.memberState.isPremium(user.id);
      expect(isPremiumNow).toBe(true);
    });

    it("should update premium status across all chat memberships", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat1 = testBot.createChat({ type: "group", title: "Group 1" });
      const chat2 = testBot.createChat({ type: "group", title: "Group 2" });

      testBot.setMember(chat1, user);
      testBot.setMember(chat2, user);

      // Set premium
      testBot.server.memberState.setPremium(user.id, true);

      // Check both memberships
      const member1 = testBot.server.memberState.getMember(chat1.id, user.id);
      const member2 = testBot.server.memberState.getMember(chat2.id, user.id);

      expect(member1?.is_premium).toBe(true);
      expect(member2?.is_premium).toBe(true);
    });

    it("should remove premium status", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      testBot.setMember(chat, user);
      testBot.server.memberState.setPremium(user.id, true);

      expect(testBot.server.memberState.isPremium(user.id)).toBe(true);

      testBot.server.memberState.setPremium(user.id, false);

      expect(testBot.server.memberState.isPremium(user.id)).toBe(false);
    });
  });

  describe("premium user handling", () => {
    it("should handle messages from premium users", async () => {
      let senderIsPremium = false;

      testBot.on("message:text", async (ctx) => {
        senderIsPremium = ctx.from?.is_premium ?? false;
        await ctx.reply("Received");
      });

      const user = testBot.createUser({ first_name: "Premium", is_premium: true });
      const chat = testBot.createChat({ type: "private" });

      await testBot.sendMessage(user, chat, "Hello");

      // Note: is_premium comes from the User object itself
      expect(senderIsPremium).toBe(true);
    });

    it("should detect non-premium users", async () => {
      let senderIsPremium: boolean | undefined;

      testBot.on("message:text", async (ctx) => {
        senderIsPremium = ctx.from?.is_premium;
        await ctx.reply("Received");
      });

      const user = testBot.createUser({ first_name: "Regular" }); // No is_premium
      const chat = testBot.createChat({ type: "private" });

      await testBot.sendMessage(user, chat, "Hello");

      expect(senderIsPremium).toBeUndefined();
    });
  });

  describe("premium features in chats", () => {
    it("should allow premium-only features based on user status", async () => {
      const premiumUser = testBot.createUser({ first_name: "Premium", is_premium: true });
      const regularUser = testBot.createUser({ first_name: "Regular" });
      const chat = testBot.createChat({ type: "private" });

      testBot.command("premium_feature", async (ctx) => {
        if (ctx.from?.is_premium) {
          await ctx.reply("Premium feature activated!");
        } else {
          await ctx.reply("This feature requires Telegram Premium");
        }
      });

      const resp1 = await testBot.sendCommand(premiumUser, chat, "/premium_feature");
      const resp2 = await testBot.sendCommand(regularUser, chat, "/premium_feature");

      expect(resp1.text).toBe("Premium feature activated!");
      expect(resp2.text).toBe("This feature requires Telegram Premium");
    });
  });
});
