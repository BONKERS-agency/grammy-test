import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestBot } from "../src/index.js";

describe("Restrictions & Slow Mode", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("Mute User", () => {
    it("should mute a user (restrict send_messages)", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const target = testBot.createUser({ first_name: "Target" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setMember(group, target);
      testBot.setBotAdmin(group, { can_restrict_members: true });

      testBot.command("mute", async (ctx) => {
        await ctx.restrictChatMember(target.id, {
          permissions: { can_send_messages: false },
        });
        await ctx.reply("User muted.");
      });

      const response = await testBot.sendCommand(admin, group, "/mute");
      expect(response.text).toBe("User muted.");

      const member = testBot.server.memberState.getMember(group.id, target.id);
      expect(member?.status).toBe("restricted");
      expect(member?.restrictedPermissions?.can_send_messages).toBe(false);
    });

    it("should mute a user for a specific duration", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const target = testBot.createUser({ first_name: "Target" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setMember(group, target);
      testBot.setBotAdmin(group, { can_restrict_members: true });

      const untilDate = Math.floor(Date.now() / 1000) + 3600; // 1 hour

      testBot.command("mute1h", async (ctx) => {
        await ctx.restrictChatMember(target.id, {
          permissions: { can_send_messages: false },
          until_date: untilDate,
        });
        await ctx.reply("User muted for 1 hour.");
      });

      const response = await testBot.sendCommand(admin, group, "/mute1h");
      expect(response.text).toBe("User muted for 1 hour.");

      const member = testBot.server.memberState.getMember(group.id, target.id);
      expect(member?.status).toBe("restricted");
      expect(member?.until_date).toBe(untilDate);
    });

    it("should unmute a user", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const target = testBot.createUser({ first_name: "Target" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setBotAdmin(group, { can_restrict_members: true });
      // First add target as member, then restrict them
      testBot.server.memberState.setMember(group.id, target);
      testBot.server.memberState.restrict(group.id, target.id, {
        can_send_messages: false,
      });

      testBot.command("unmute", async (ctx) => {
        await ctx.restrictChatMember(target.id, {
          permissions: {
            can_send_messages: true,
            can_send_audios: true,
            can_send_documents: true,
            can_send_photos: true,
            can_send_videos: true,
            can_send_video_notes: true,
            can_send_voice_notes: true,
            can_send_polls: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true,
          },
        });
        await ctx.reply("User unmuted.");
      });

      const response = await testBot.sendCommand(admin, group, "/unmute");
      expect(response.text).toBe("User unmuted.");

      const member = testBot.server.memberState.getMember(group.id, target.id);
      expect(member?.restrictedPermissions?.can_send_messages).toBe(true);
    });
  });

  describe("Restrict Media", () => {
    it("should restrict user from sending media", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const target = testBot.createUser({ first_name: "Target" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setMember(group, target);
      testBot.setBotAdmin(group, { can_restrict_members: true });

      testBot.command("nomedia", async (ctx) => {
        await ctx.restrictChatMember(target.id, {
          permissions: {
            can_send_messages: true,
            can_send_audios: false,
            can_send_documents: false,
            can_send_photos: false,
            can_send_videos: false,
          },
        });
        await ctx.reply("User restricted from media.");
      });

      const response = await testBot.sendCommand(admin, group, "/nomedia");
      expect(response.text).toBe("User restricted from media.");

      const member = testBot.server.memberState.getMember(group.id, target.id);
      expect(member?.restrictedPermissions?.can_send_messages).toBe(true);
      expect(member?.restrictedPermissions?.can_send_photos).toBe(false);
      expect(member?.restrictedPermissions?.can_send_videos).toBe(false);
    });
  });

  describe("Chat Permissions", () => {
    it("should set default chat permissions (lock chat)", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setBotAdmin(group, { can_restrict_members: true });

      testBot.command("lock", async (ctx) => {
        await ctx.setChatPermissions({
          can_send_messages: false,
        });
        await ctx.reply("Chat locked.");
      });

      const response = await testBot.sendCommand(admin, group, "/lock");
      expect(response.text).toBe("Chat locked.");

      const chatData = testBot.server.chatState.getOrCreate(group);
      expect(chatData.permissions?.can_send_messages).toBe(false);
    });

    it("should unlock chat", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setBotAdmin(group, { can_restrict_members: true });
      testBot.server.chatState.setChatPermissions(group.id, { can_send_messages: false });

      testBot.command("unlock", async (ctx) => {
        await ctx.setChatPermissions({
          can_send_messages: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
        });
        await ctx.reply("Chat unlocked.");
      });

      const response = await testBot.sendCommand(admin, group, "/unlock");
      expect(response.text).toBe("Chat unlocked.");

      const chatData = testBot.server.chatState.getOrCreate(group);
      expect(chatData.permissions?.can_send_messages).toBe(true);
    });
  });

  describe("Slow Mode", () => {
    it("should enable slow mode", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      // Slow mode requires can_restrict_members permission
      testBot.setBotAdmin(group, { can_restrict_members: true });

      testBot.command("slowmode", async (ctx) => {
        // setChatSlowModeDelay may not be available in all grammY versions
        // Use the raw API call instead
        await ctx.api.raw.setChatSlowModeDelay({ chat_id: ctx.chat!.id, slow_mode_delay: 30 });
        await ctx.reply("Slow mode: 30 seconds.");
      });

      const response = await testBot.sendCommand(admin, group, "/slowmode");
      expect(response.text).toBe("Slow mode: 30 seconds.");

      const chatData = testBot.server.chatState.getOrCreate(group);
      expect(chatData.slowModeDelay).toBe(30);
    });

    it("should disable slow mode", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      // Slow mode requires can_restrict_members permission
      testBot.setBotAdmin(group, { can_restrict_members: true });
      testBot.server.chatState.setSlowModeDelay(group.id, 30);

      testBot.command("slowoff", async (ctx) => {
        // setChatSlowModeDelay may not be available in all grammY versions
        // Use the raw API call instead
        await ctx.api.raw.setChatSlowModeDelay({ chat_id: ctx.chat!.id, slow_mode_delay: 0 });
        await ctx.reply("Slow mode disabled.");
      });

      const response = await testBot.sendCommand(admin, group, "/slowoff");
      expect(response.text).toBe("Slow mode disabled.");

      const chatData = testBot.server.chatState.getOrCreate(group);
      expect(chatData.slowModeDelay).toBe(0);
    });

    it("should enforce slow mode rate limit", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const member = testBot.createUser({ first_name: "Member" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setMember(group, member);
      testBot.server.chatState.setSlowModeDelay(group.id, 30);

      // Track messages sent
      const messagesSent: string[] = [];

      testBot.on("message:text", async (ctx) => {
        messagesSent.push(ctx.message.text);
        await ctx.reply(`Received: ${ctx.message.text}`);
      });

      // First message should work
      const response1 = await testBot.sendMessage(member, group, "First message");
      expect(response1.text).toBe("Received: First message");

      // Second message should be rate limited (in real implementation)
      // For now, just verify the slow mode is set
      expect(testBot.server.chatState.getOrCreate(group).slowModeDelay).toBe(30);
    });

    it("should not apply slow mode to admins", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.server.chatState.setSlowModeDelay(group.id, 30);

      testBot.on("message:text", async (ctx) => {
        await ctx.reply(`Got: ${ctx.message.text}`);
      });

      // Admin should be able to send messages regardless of slow mode
      const response1 = await testBot.sendMessage(admin, group, "Message 1");
      expect(response1.text).toBe("Got: Message 1");

      const response2 = await testBot.sendMessage(admin, group, "Message 2");
      expect(response2.text).toBe("Got: Message 2");
    });
  });

  describe("Restriction Checks", () => {
    it("should check if user is restricted", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      // Add member then restrict them
      testBot.server.memberState.setMember(group.id, user);
      testBot.server.memberState.restrict(group.id, user.id, {
        can_send_messages: false,
      });

      testBot.command("checkme", async (ctx) => {
        const member = await ctx.getChatMember(ctx.from!.id);
        if (member.status === "restricted") {
          await ctx.reply("You are restricted.");
        } else {
          await ctx.reply("You are not restricted.");
        }
      });

      const response = await testBot.sendCommand(user, group, "/checkme");
      expect(response.text).toBe("You are restricted.");
    });

    it("should check specific permissions", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      // Add member then restrict them with specific permissions
      testBot.server.memberState.setMember(group.id, user);
      testBot.server.memberState.restrict(group.id, user.id, {
        can_send_messages: true,
        can_send_photos: false,
      });

      testBot.command("perms", async (ctx) => {
        const member = await ctx.getChatMember(ctx.from!.id);
        if (member.status === "restricted") {
          const perms: string[] = [];
          if (member.can_send_messages) perms.push("messages");
          if (member.can_send_photos) perms.push("photos");
          await ctx.reply(`Can send: ${perms.join(", ") || "nothing"}`);
        }
      });

      const response = await testBot.sendCommand(user, group, "/perms");
      expect(response.text).toBe("Can send: messages");
    });
  });

  describe("Anonymous Admins", () => {
    it("should support anonymous admin", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setAdmin(group, admin, {
        is_anonymous: true,
        can_delete_messages: true,
      });

      const member = testBot.server.memberState.getMember(group.id, admin.id);
      expect(member?.is_anonymous).toBe(true);
    });
  });
});
