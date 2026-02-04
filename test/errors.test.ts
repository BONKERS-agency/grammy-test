import { BotError } from "grammy";
import type { Message } from "grammy/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestBot } from "../src/index.js";

describe("Error Handling", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("Chat Not Found Errors", () => {
    it("should error when sending to non-existent chat", async () => {
      testBot.command("send", async (ctx) => {
        await ctx.api.sendMessage(999999, "Hello");
      });

      const user = testBot.createUser({ first_name: "Alice" });
      const chat = testBot.createChat({ type: "private" });

      await expect(testBot.sendCommand(user, chat, "/send")).rejects.toThrow(BotError);
    });

    it("should error when editing message in non-existent chat", async () => {
      testBot.command("edit", async (ctx) => {
        await ctx.api.editMessageText(999999, 1, "New text");
      });

      const user = testBot.createUser({ first_name: "Bob" });
      const chat = testBot.createChat({ type: "private" });

      await expect(testBot.sendCommand(user, chat, "/edit")).rejects.toThrow(BotError);
    });
  });

  describe("Message Not Found Errors", () => {
    it("should error when editing non-existent message", async () => {
      testBot.command("edit", async (ctx) => {
        await ctx.api.editMessageText(ctx.chat.id, 999999, "New text");
      });

      const user = testBot.createUser({ first_name: "Charlie" });
      const chat = testBot.createChat({ type: "private" });

      await expect(testBot.sendCommand(user, chat, "/edit")).rejects.toThrow(BotError);
    });

    it("should error when deleting non-existent message", async () => {
      testBot.command("delete", async (ctx) => {
        await ctx.api.deleteMessage(ctx.chat.id, 999999);
      });

      const user = testBot.createUser({ first_name: "Dave" });
      const chat = testBot.createChat({ type: "private" });

      await expect(testBot.sendCommand(user, chat, "/delete")).rejects.toThrow(BotError);
    });

    it("should error when pinning non-existent message", async () => {
      testBot.command("pin", async (ctx) => {
        await ctx.api.pinChatMessage(ctx.chat.id, 999999);
      });

      const user = testBot.createUser({ first_name: "Eve" });
      const chat = testBot.createChat({ type: "supergroup", title: "Test" });
      testBot.setOwner(chat, user);

      await expect(testBot.sendCommand(user, chat, "/pin")).rejects.toThrow(BotError);
    });
  });

  describe("User Not Found Errors", () => {
    it("should error when banning non-existent user", async () => {
      testBot.command("ban", async (ctx) => {
        await ctx.banChatMember(999999);
      });

      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });
      testBot.setOwner(group, admin);

      await expect(testBot.sendCommand(admin, group, "/ban")).rejects.toThrow(BotError);
    });

    it("should error when promoting non-existent user", async () => {
      testBot.command("promote", async (ctx) => {
        await ctx.promoteChatMember(999999, { can_delete_messages: true });
      });

      const owner = testBot.createUser({ first_name: "Owner" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });
      testBot.setOwner(group, owner);

      await expect(testBot.sendCommand(owner, group, "/promote")).rejects.toThrow(BotError);
    });

    it("should return 'left' status for non-existent chat member", async () => {
      let memberStatus: string | undefined;

      testBot.command("check", async (ctx) => {
        const member = await ctx.getChatMember(999999);
        memberStatus = member.status;
        await ctx.reply(`Status: ${member.status}`);
      });

      const user = testBot.createUser({ first_name: "User" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });
      testBot.setMember(group, user);

      const response = await testBot.sendCommand(user, group, "/check");
      // Framework returns "left" status for unknown users
      expect(memberStatus).toBe("left");
      expect(response.text).toBe("Status: left");
    });
  });

  describe("Permission Errors", () => {
    it("should implement admin-only check in bot handler", async () => {
      // The framework allows any member to call banChatMember API,
      // but real bots should implement permission checks in handlers
      const admin = testBot.createUser({ first_name: "Admin" });
      const member = testBot.createUser({ first_name: "Member" });
      const target = testBot.createUser({ first_name: "Target" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });

      testBot.setOwner(group, admin);
      testBot.setMember(group, member);
      testBot.setMember(group, target);

      testBot.command("ban", async (ctx) => {
        // Check if sender is admin before banning
        const senderMember = await ctx.getChatMember(ctx.from?.id ?? 0);
        if (senderMember.status !== "administrator" && senderMember.status !== "creator") {
          return ctx.reply("Admin only!");
        }
        await ctx.banChatMember(target.id);
        await ctx.reply("Banned.");
      });

      // Non-admin gets rejected by our handler logic
      const response = await testBot.sendCommand(member, group, "/ban");
      expect(response.text).toBe("Admin only!");
    });

    it("should error when trying to ban creator", async () => {
      const owner = testBot.createUser({ first_name: "Owner" });
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });

      testBot.setOwner(group, owner);
      testBot.setAdmin(group, admin, { can_restrict_members: true });

      testBot.command("ban", async (ctx) => {
        await ctx.banChatMember(owner.id);
      });

      // Can't ban the creator - framework does check this
      await expect(testBot.sendCommand(admin, group, "/ban")).rejects.toThrow(BotError);
    });
  });

  describe("Poll Errors", () => {
    it("should return undefined when voting on closed poll", async () => {
      const user = testBot.createUser({ first_name: "Voter" });
      const chat = testBot.createChat({ type: "group", title: "Test" });

      testBot.command("poll", async (ctx) => {
        await ctx.replyWithPoll("Question?", ["A", "B", "C"]);
      });

      const pollResponse = await testBot.sendCommand(user, chat, "/poll");
      const poll = pollResponse.poll;
      expect(poll).toBeDefined();

      // Close the poll using stopPoll
      testBot.server.pollState.stopPoll(poll.id);

      // Try to vote - should return undefined from pollState.vote
      const voteResult = testBot.server.pollState.vote(poll.id, user.id, [0]);
      expect(voteResult).toBeUndefined();
    });

    it("should return undefined when voting with invalid option", async () => {
      const user = testBot.createUser({ first_name: "Voter" });
      const chat = testBot.createChat({ type: "group", title: "Test" });

      testBot.command("poll", async (ctx) => {
        await ctx.replyWithPoll("Question?", ["A", "B"]);
      });

      const pollResponse = await testBot.sendCommand(user, chat, "/poll");
      const poll = pollResponse.poll;
      expect(poll).toBeDefined();

      // Vote with invalid option index - should return undefined
      const voteResult = testBot.server.pollState.vote(poll.id, user.id, [99]);
      expect(voteResult).toBeUndefined();
    });
  });

  describe("Invite Link Errors", () => {
    it("should error when using revoked invite link", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const newUser = testBot.createUser({ first_name: "NewUser" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });

      testBot.setOwner(group, admin);

      const link = testBot.server.chatState.createInviteLink(group.id, admin, {});
      expect(link).toBeDefined();
      testBot.server.chatState.revokeInviteLink(group.id, link?.invite_link ?? "");

      const joinResponse = await testBot.simulateJoinViaLink(
        newUser,
        group,
        link?.invite_link ?? "",
      );
      expect(joinResponse.error).toBeDefined();
      expect(joinResponse.error?.description).toContain("revoked");
    });

    it("should error when invite link member limit reached", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });

      testBot.setOwner(group, admin);

      const link = testBot.server.chatState.createInviteLink(group.id, admin, { member_limit: 1 });
      expect(link).toBeDefined();

      // First user joins successfully
      const user1 = testBot.createUser({ first_name: "User1" });
      await testBot.simulateJoinViaLink(user1, group, link?.invite_link ?? "");

      // Second user should fail
      const user2 = testBot.createUser({ first_name: "User2" });
      const joinResponse = await testBot.simulateJoinViaLink(user2, group, link?.invite_link ?? "");
      expect(joinResponse.error).toBeDefined();
      expect(joinResponse.error?.description).toContain("limit");
    });

    it("should error when banned user tries to join via invite link", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const bannedUser = testBot.createUser({ first_name: "BannedUser" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });

      testBot.setOwner(group, admin);

      // First add user as member, then ban them
      testBot.setMember(group, bannedUser);
      testBot.server.memberState.ban(group.id, bannedUser.id);

      // Verify user is banned
      const member = testBot.server.memberState.getMember(group.id, bannedUser.id);
      expect(member?.status).toBe("kicked");

      // Create an invite link
      const link = testBot.server.chatState.createInviteLink(group.id, admin, {});
      expect(link).toBeDefined();

      // Banned user tries to join
      const joinResponse = await testBot.simulateJoinViaLink(
        bannedUser,
        group,
        link?.invite_link ?? "",
      );
      expect(joinResponse.error).toBeDefined();
      expect(joinResponse.error?.description).toContain("banned");
    });
  });

  describe("Slow Mode Simulation", () => {
    it("should set slow mode delay on a chat", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });

      testBot.setOwner(group, admin);

      // Enable slow mode (30 seconds)
      testBot.server.chatState.setSlowModeDelay(group.id, 30);

      // Verify slow mode is set via get method
      const chatState = testBot.server.chatState.get(group.id);
      expect(chatState?.slowModeDelay).toBe(30);

      // Also verify via the getter method
      expect(testBot.server.chatState.getSlowModeDelay(group.id)).toBe(30);
    });

    it("should allow admin to send multiple messages", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });

      testBot.setOwner(group, admin);
      testBot.server.chatState.setSlowModeDelay(group.id, 30);

      testBot.on("message:text", (ctx) => ctx.reply("Got it"));

      // Admin should be able to send multiple messages
      const response1 = await testBot.sendMessage(admin, group, "First");
      expect(response1.text).toBe("Got it");

      const response2 = await testBot.sendMessage(admin, group, "Second");
      expect(response2.text).toBe("Got it");
    });
  });

  describe("Restricted Member Handling", () => {
    it("should track restricted member permissions", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const restricted = testBot.createUser({ first_name: "Restricted" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });

      testBot.setOwner(group, admin);
      testBot.setMember(group, restricted);
      testBot.server.memberState.restrict(group.id, restricted.id, {
        can_send_messages: false,
      });

      const member = testBot.server.memberState.getMember(group.id, restricted.id);
      expect(member?.status).toBe("restricted");
      expect(member?.restrictedPermissions?.can_send_messages).toBe(false);
    });
  });

  describe("Callback Query Handling", () => {
    it("should answer callback once", async () => {
      let answerCount = 0;

      testBot.callbackQuery("test", async (ctx) => {
        await ctx.answerCallbackQuery("First answer");
        answerCount++;
      });

      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.clickButton(user, chat, "test");
      expect(response.callbackAnswer?.text).toBe("First answer");
      expect(answerCount).toBe(1);
    });
  });

  describe("Pre-Checkout Errors", () => {
    it("should propagate pre-checkout rejection reason", async () => {
      testBot.on("pre_checkout_query", async (ctx) => {
        await ctx.answerPreCheckoutQuery(false, { error_message: "Item out of stock" });
      });

      const user = testBot.createUser({ first_name: "Buyer" });

      const response = await testBot.simulatePreCheckout(user, {
        id: "checkout_123",
        currency: "USD",
        total_amount: 1000,
        invoice_payload: "item_001",
      });

      expect(response.preCheckoutAnswer?.ok).toBe(false);
      expect(response.preCheckoutAnswer?.errorMessage).toBe("Item out of stock");
    });
  });

  describe("Shipping Query Errors", () => {
    it("should propagate shipping rejection reason", async () => {
      testBot.on("shipping_query", async (ctx) => {
        await ctx.answerShippingQuery(false, { error_message: "Cannot ship to this region" });
      });

      const user = testBot.createUser({ first_name: "Buyer" });

      const response = await testBot.simulateShippingQuery(user, {
        id: "shipping_123",
        invoice_payload: "item_001",
        shipping_address: {
          country_code: "XX",
          state: "Unknown",
          city: "Unknown",
          street_line1: "123 Test St",
          street_line2: "",
          post_code: "00000",
        },
      });

      expect(response.shippingAnswer?.ok).toBe(false);
      expect(response.shippingAnswer?.errorMessage).toBe("Cannot ship to this region");
    });
  });

  describe("Bot Permission Errors", () => {
    it("should error when bot lacks can_restrict_members permission", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const target = testBot.createUser({ first_name: "Target" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });

      testBot.setOwner(group, admin);
      testBot.setMember(group, target);
      // Bot is NOT set as admin, so it lacks permissions

      testBot.command("ban", async (ctx) => {
        await ctx.banChatMember(target.id);
      });

      await expect(testBot.sendCommand(admin, group, "/ban")).rejects.toThrow(
        /not enough rights to restrict/,
      );
    });

    it("should error when bot lacks can_delete_messages permission for others' messages", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const user = testBot.createUser({ first_name: "User" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });

      testBot.setOwner(group, admin);
      testBot.setMember(group, user);
      // Bot has no permissions

      // Store a message from the user (not the bot)
      testBot.server.chatState.storeMessage(group.id, {
        message_id: 100,
        date: Math.floor(Date.now() / 1000),
        chat: group,
        from: user,
        text: "User message",
      } as Message);

      testBot.command("delete", async (ctx) => {
        await ctx.api.deleteMessage(group.id, 100);
      });

      await expect(testBot.sendCommand(admin, group, "/delete")).rejects.toThrow(
        /not enough rights to delete messages/,
      );
    });

    it("should allow bot to delete its own messages without permission", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });

      testBot.setOwner(group, admin);
      // Bot has no special permissions

      // Store a message from the bot itself
      testBot.server.chatState.storeMessage(group.id, {
        message_id: 100,
        date: Math.floor(Date.now() / 1000),
        chat: group,
        from: { id: testBot.botInfo.id, is_bot: true, first_name: "Bot" },
        text: "Bot's own message",
      } as Message);

      testBot.command("delete", async (ctx) => {
        await ctx.api.deleteMessage(group.id, 100);
        await ctx.reply("Deleted");
      });

      const response = await testBot.sendCommand(admin, group, "/delete");
      expect(response.text).toBe("Deleted");
    });

    it("should allow bot to delete user messages in private chat", async () => {
      // In private chats, bots CAN delete both their own messages and user messages
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      // Store a message from the user (not the bot)
      testBot.server.chatState.storeMessage(chat.id, {
        message_id: 100,
        date: Math.floor(Date.now() / 1000),
        chat: chat,
        from: user,
        text: "User message",
      } as Message);

      testBot.command("delete", async (ctx) => {
        await ctx.api.deleteMessage(chat.id, 100);
        await ctx.reply("Deleted");
      });

      const response = await testBot.sendCommand(user, chat, "/delete");
      expect(response.text).toBe("Deleted");
      expect(response.deletedMessageIds).toContain(100);
    });

    it("should allow admin operations in private chats without permission checks", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      // Bot has no special permissions, but pin should work in private chats
      // because permission checks are skipped for private chats

      testBot.command("pin", async (ctx) => {
        // Store a message first
        testBot.server.chatState.storeMessage(chat.id, {
          message_id: 100,
          date: Math.floor(Date.now() / 1000),
          chat: chat,
          from: { id: testBot.botInfo.id, is_bot: true, first_name: "Bot" },
          text: "Pinnable message",
        } as Message);
        await ctx.pinChatMessage(100);
        await ctx.reply("Pinned");
      });

      const response = await testBot.sendCommand(user, chat, "/pin");
      expect(response.text).toBe("Pinned");
    });

    it("should error when bot lacks can_invite_users permission", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });

      testBot.setOwner(group, admin);
      // Bot has no invite permission

      testBot.command("invite", async (ctx) => {
        await ctx.createChatInviteLink();
      });

      await expect(testBot.sendCommand(admin, group, "/invite")).rejects.toThrow(
        /not enough rights to invite/,
      );
    });

    it("should error when bot lacks can_manage_topics permission", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const forum = testBot.createChat({
        type: "supergroup",
        title: "Forum",
        is_forum: true,
      });

      testBot.setOwner(forum, admin);
      // Bot has no topics permission

      testBot.command("topic", async (ctx) => {
        await ctx.createForumTopic("Test Topic");
      });

      await expect(testBot.sendCommand(admin, forum, "/topic")).rejects.toThrow(
        /not enough rights to create forum topics/,
      );
    });

    it("should error when bot lacks can_change_info permission", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });

      testBot.setOwner(group, admin);
      // Bot has no change_info permission

      testBot.command("title", async (ctx) => {
        await ctx.setChatTitle("New Title");
      });

      await expect(testBot.sendCommand(admin, group, "/title")).rejects.toThrow(
        /not enough rights to change chat title/,
      );
    });

    it("should succeed when bot has required permission", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const target = testBot.createUser({ first_name: "Target" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });

      testBot.setOwner(group, admin);
      testBot.setMember(group, target);
      testBot.setBotAdmin(group, { can_restrict_members: true });

      testBot.command("ban", async (ctx) => {
        await ctx.banChatMember(target.id);
        await ctx.reply("Banned");
      });

      const response = await testBot.sendCommand(admin, group, "/ban");
      expect(response.text).toBe("Banned");
    });
  });
});
