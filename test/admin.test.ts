import type { Message } from "grammy/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestBot } from "../src/index.js";

describe("Admin & Moderation", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("Role Setup", () => {
    it("should set up owner of a group", async () => {
      const owner = testBot.createUser({ first_name: "Owner" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, owner);

      const member = testBot.server.memberState.getMember(group.id, owner.id);
      expect(member?.status).toBe("creator");
    });

    it("should recognize owner as admin via isAdmin method", async () => {
      const owner = testBot.createUser({ first_name: "Owner" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, owner);

      expect(testBot.server.memberState.isAdmin(group.id, owner.id)).toBe(true);
      expect(testBot.server.memberState.isOwner(group.id, owner.id)).toBe(true);
    });

    it("should set up admin with permissions", async () => {
      const owner = testBot.createUser({ first_name: "Owner" });
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, owner);
      testBot.setAdmin(group, admin, {
        can_delete_messages: true,
        can_restrict_members: true,
        can_promote_members: false,
      });

      const member = testBot.server.memberState.getMember(group.id, admin.id);
      expect(member?.status).toBe("administrator");
      expect(member?.adminRights?.can_delete_messages).toBe(true);
      expect(member?.adminRights?.can_restrict_members).toBe(true);
      expect(member?.adminRights?.can_promote_members).toBe(false);
    });

    it("should set up regular member", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setMember(group, user);

      const member = testBot.server.memberState.getMember(group.id, user.id);
      expect(member?.status).toBe("member");
    });
  });

  describe("Admin-Only Commands", () => {
    it("should reject command from non-admin", async () => {
      const owner = testBot.createUser({ first_name: "Owner" });
      const member = testBot.createUser({ first_name: "Member" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, owner);
      testBot.setMember(group, member);

      testBot.command("ban", async (ctx) => {
        const chatMember = await ctx.getChatMember(ctx.from?.id ?? 0);
        if (chatMember.status !== "administrator" && chatMember.status !== "creator") {
          return ctx.reply("Admin only!");
        }
        await ctx.reply("User banned.");
      });

      const response = await testBot.sendCommand(member, group, "/ban");
      expect(response.text).toBe("Admin only!");
    });

    it("should allow command from admin", async () => {
      const owner = testBot.createUser({ first_name: "Owner" });
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, owner);
      testBot.setAdmin(group, admin, { can_restrict_members: true });

      testBot.command("warn", async (ctx) => {
        const chatMember = await ctx.getChatMember(ctx.from?.id ?? 0);
        if (chatMember.status !== "administrator" && chatMember.status !== "creator") {
          return ctx.reply("Admin only!");
        }
        await ctx.reply("User warned.");
      });

      const response = await testBot.sendCommand(admin, group, "/warn");
      expect(response.text).toBe("User warned.");
    });

    it("should recognize owner as admin for admin-only commands", async () => {
      const owner = testBot.createUser({ first_name: "Owner" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, owner);

      testBot.command("warn", async (ctx) => {
        const chatMember = await ctx.getChatMember(ctx.from?.id ?? 0);
        if (chatMember.status !== "administrator" && chatMember.status !== "creator") {
          return ctx.reply("Admin only!");
        }
        await ctx.reply("User warned.");
      });

      const response = await testBot.sendCommand(owner, group, "/warn");
      expect(response.text).toBe("User warned.");
    });

    it("should allow command from owner", async () => {
      const owner = testBot.createUser({ first_name: "Owner" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, owner);

      testBot.command("settings", async (ctx) => {
        const chatMember = await ctx.getChatMember(ctx.from?.id ?? 0);
        if (chatMember.status !== "creator") {
          return ctx.reply("Owner only!");
        }
        await ctx.reply("Settings menu.");
      });

      const response = await testBot.sendCommand(owner, group, "/settings");
      expect(response.text).toBe("Settings menu.");
    });
  });

  describe("Ban & Kick", () => {
    it("should ban a user", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const target = testBot.createUser({ first_name: "Target" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setMember(group, target);
      // Bot needs can_restrict_members permission to ban
      testBot.setBotAdmin(group, { can_restrict_members: true });

      testBot.command("ban", async (ctx) => {
        await ctx.banChatMember(target.id);
        await ctx.reply("User banned.");
      });

      const response = await testBot.sendCommand(admin, group, "/ban");
      expect(response.text).toBe("User banned.");

      const member = testBot.server.memberState.getMember(group.id, target.id);
      expect(member?.status).toBe("kicked");
    });

    it("should kick a user (ban then unban)", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const target = testBot.createUser({ first_name: "Target" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setMember(group, target);
      // Bot needs can_restrict_members permission to kick
      testBot.setBotAdmin(group, { can_restrict_members: true });

      testBot.command("kick", async (ctx) => {
        await ctx.banChatMember(target.id);
        await ctx.unbanChatMember(target.id);
        await ctx.reply("User kicked.");
      });

      const response = await testBot.sendCommand(admin, group, "/kick");
      expect(response.text).toBe("User kicked.");

      const member = testBot.server.memberState.getMember(group.id, target.id);
      expect(member?.status).toBe("left");
    });

    it("should unban a previously banned user", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const target = testBot.createUser({ first_name: "Target" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.server.memberState.setMember(group.id, target, "kicked");
      // Bot needs can_restrict_members permission to unban
      testBot.setBotAdmin(group, { can_restrict_members: true });

      testBot.command("unban", async (ctx) => {
        await ctx.unbanChatMember(target.id);
        await ctx.reply("User unbanned.");
      });

      const response = await testBot.sendCommand(admin, group, "/unban");
      expect(response.text).toBe("User unbanned.");

      const member = testBot.server.memberState.getMember(group.id, target.id);
      expect(member?.status).toBe("left");
    });
  });

  describe("Promote & Demote", () => {
    it("should promote a user to admin", async () => {
      const owner = testBot.createUser({ first_name: "Owner" });
      const target = testBot.createUser({ first_name: "Target" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, owner);
      testBot.setMember(group, target);
      // Bot needs can_promote_members permission to promote
      testBot.setBotAdmin(group, { can_promote_members: true });

      testBot.command("promote", async (ctx) => {
        await ctx.promoteChatMember(target.id, {
          can_delete_messages: true,
          can_restrict_members: true,
          can_pin_messages: true,
        });
        await ctx.reply("User promoted.");
      });

      const response = await testBot.sendCommand(owner, group, "/promote");
      expect(response.text).toBe("User promoted.");

      const member = testBot.server.memberState.getMember(group.id, target.id);
      expect(member?.status).toBe("administrator");
      expect(member?.adminRights?.can_delete_messages).toBe(true);
      expect(member?.adminRights?.can_restrict_members).toBe(true);
      expect(member?.adminRights?.can_pin_messages).toBe(true);
    });

    it("should demote an admin", async () => {
      const owner = testBot.createUser({ first_name: "Owner" });
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, owner);
      testBot.setAdmin(group, admin, {
        can_delete_messages: true,
        can_restrict_members: true,
      });
      // Bot needs can_promote_members permission to demote
      testBot.setBotAdmin(group, { can_promote_members: true });

      testBot.command("demote", async (ctx) => {
        await ctx.promoteChatMember(admin.id, {
          can_delete_messages: false,
          can_restrict_members: false,
          can_promote_members: false,
          can_change_info: false,
          can_invite_users: false,
          can_pin_messages: false,
          can_manage_topics: false,
        });
        await ctx.reply("Admin demoted.");
      });

      const response = await testBot.sendCommand(owner, group, "/demote");
      expect(response.text).toBe("Admin demoted.");

      const member = testBot.server.memberState.getMember(group.id, admin.id);
      // After removing all permissions, user is demoted to member (adminRights undefined)
      expect(member?.status).toBe("member");
      expect(member?.adminRights).toBeUndefined();
    });

    it("should set custom admin title", async () => {
      const owner = testBot.createUser({ first_name: "Owner" });
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, owner);
      testBot.setAdmin(group, admin, { can_delete_messages: true });
      // Bot needs can_promote_members permission to set custom title
      testBot.setBotAdmin(group, { can_promote_members: true });

      testBot.command("title", async (ctx) => {
        await ctx.setChatAdministratorCustomTitle(admin.id, "Moderator");
        await ctx.reply("Title set.");
      });

      const response = await testBot.sendCommand(owner, group, "/title");
      expect(response.text).toBe("Title set.");

      const member = testBot.server.memberState.getMember(group.id, admin.id);
      expect(member?.custom_title).toBe("Moderator");
    });
  });

  describe("Get Chat Member Info", () => {
    it("should get chat member status", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setMember(group, user);

      testBot.command("status", async (ctx) => {
        const member = await ctx.getChatMember(ctx.from?.id ?? 0);
        await ctx.reply(`Your status: ${member.status}`);
      });

      const response = await testBot.sendCommand(user, group, "/status");
      expect(response.text).toBe("Your status: member");
    });

    it("should get chat administrators", async () => {
      const owner = testBot.createUser({ first_name: "Owner" });
      const admin1 = testBot.createUser({ first_name: "Admin1" });
      const admin2 = testBot.createUser({ first_name: "Admin2" });
      const member = testBot.createUser({ first_name: "Member" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, owner);
      testBot.setAdmin(group, admin1, { can_delete_messages: true });
      testBot.setAdmin(group, admin2, { can_delete_messages: true });
      testBot.setMember(group, member);

      testBot.command("admins", async (ctx) => {
        const admins = await ctx.getChatAdministrators();
        const names = admins.map((a) => a.user.first_name).sort();
        await ctx.reply(`Admins: ${names.join(", ")}`);
      });

      const response = await testBot.sendCommand(member, group, "/admins");
      expect(response.text).toBe("Admins: Admin1, Admin2, Owner");
    });

    it("should get chat member count", async () => {
      const owner = testBot.createUser({ first_name: "Owner" });
      const user1 = testBot.createUser({ first_name: "User1" });
      const user2 = testBot.createUser({ first_name: "User2" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, owner);
      testBot.setMember(group, user1);
      testBot.setMember(group, user2);

      testBot.command("count", async (ctx) => {
        const count = await ctx.getChatMemberCount();
        await ctx.reply(`Members: ${count}`);
      });

      const response = await testBot.sendCommand(owner, group, "/count");
      expect(response.text).toBe("Members: 3");
    });
  });

  describe("Delete Messages", () => {
    it("should delete a message", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      // Bot needs can_delete_messages permission to delete others' messages
      testBot.setBotAdmin(group, { can_delete_messages: true });

      // Store a message first
      testBot.server.chatState.storeMessage(group.id, {
        message_id: 100,
        date: Math.floor(Date.now() / 1000),
        chat: group,
        text: "Message to delete",
      } as Message);

      testBot.command("delete", async (ctx) => {
        await ctx.api.deleteMessage(group.id, 100);
        await ctx.reply("Message deleted.");
      });

      const response = await testBot.sendCommand(admin, group, "/delete");
      expect(response.text).toBe("Message deleted.");
      expect(response.deletedMessageIds).toContain(100);
    });
  });

  describe("Pin Messages", () => {
    it("should pin a message", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      // Bot needs can_pin_messages permission
      testBot.setBotAdmin(group, { can_pin_messages: true });

      testBot.command("pin", async (ctx) => {
        await ctx.pinChatMessage(1);
        await ctx.reply("Message pinned.");
      });

      const response = await testBot.sendCommand(admin, group, "/pin");
      expect(response.text).toBe("Message pinned.");
    });

    it("should unpin a message", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      // Bot needs can_pin_messages permission
      testBot.setBotAdmin(group, { can_pin_messages: true });

      testBot.command("unpin", async (ctx) => {
        await ctx.unpinChatMessage(1);
        await ctx.reply("Message unpinned.");
      });

      const response = await testBot.sendCommand(admin, group, "/unpin");
      expect(response.text).toBe("Message unpinned.");
    });

    it("should unpin all messages", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      // Bot needs can_pin_messages permission
      testBot.setBotAdmin(group, { can_pin_messages: true });

      testBot.command("unpinall", async (ctx) => {
        await ctx.unpinAllChatMessages();
        await ctx.reply("All messages unpinned.");
      });

      const response = await testBot.sendCommand(admin, group, "/unpinall");
      expect(response.text).toBe("All messages unpinned.");
    });
  });
});
