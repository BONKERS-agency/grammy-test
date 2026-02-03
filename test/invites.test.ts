import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestBot } from "../src/index.js";

describe("Invite Links", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("Create Invite Link", () => {
    it("should create a basic invite link", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setBotAdmin(group, { can_invite_users: true });

      testBot.command("invite", async (ctx) => {
        const link = await ctx.createChatInviteLink();
        await ctx.reply(`Join: ${link.invite_link}`);
      });

      const response = await testBot.sendCommand(admin, group, "/invite");

      expect(response.text).toContain("Join:");
      expect(response.text).toContain("https://t.me/");

      const links = testBot.server.chatState.getInviteLinks(group.id);
      expect(links).toHaveLength(1);
    });

    it("should create invite link with name", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setBotAdmin(group, { can_invite_users: true });

      testBot.command("invite", async (ctx) => {
        const link = await ctx.createChatInviteLink({ name: "Public Invite" });
        await ctx.reply(`Created: ${link.name}`);
      });

      const response = await testBot.sendCommand(admin, group, "/invite");

      expect(response.text).toBe("Created: Public Invite");

      const links = testBot.server.chatState.getInviteLinks(group.id);
      expect(links[0].name).toBe("Public Invite");
    });

    it("should create invite link with member limit", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setBotAdmin(group, { can_invite_users: true });

      testBot.command("limited", async (ctx) => {
        const link = await ctx.createChatInviteLink({ member_limit: 50 });
        await ctx.reply(`Limit: ${link.member_limit}`);
      });

      const response = await testBot.sendCommand(admin, group, "/limited");

      expect(response.text).toBe("Limit: 50");

      const links = testBot.server.chatState.getInviteLinks(group.id);
      expect(links[0].member_limit).toBe(50);
    });

    it("should create invite link with expiration", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setBotAdmin(group, { can_invite_users: true });

      const expireDate = Math.floor(Date.now() / 1000) + 86400; // 24 hours

      testBot.command("temp", async (ctx) => {
        const link = await ctx.createChatInviteLink({ expire_date: expireDate });
        await ctx.reply("Temporary link created");
      });

      await testBot.sendCommand(admin, group, "/temp");

      const links = testBot.server.chatState.getInviteLinks(group.id);
      expect(links[0].expire_date).toBe(expireDate);
    });

    it("should create invite link requiring approval", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setBotAdmin(group, { can_invite_users: true });

      testBot.command("approval", async (ctx) => {
        const link = await ctx.createChatInviteLink({ creates_join_request: true });
        await ctx.reply(`Needs approval: ${link.creates_join_request}`);
      });

      const response = await testBot.sendCommand(admin, group, "/approval");

      expect(response.text).toBe("Needs approval: true");

      const links = testBot.server.chatState.getInviteLinks(group.id);
      expect(links[0].creates_join_request).toBe(true);
    });
  });

  describe("Edit Invite Link", () => {
    it("should edit invite link name", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setBotAdmin(group, { can_invite_users: true });

      const link = testBot.server.chatState.createInviteLink(group.id, admin, {
        name: "Old Name",
      });

      testBot.command("rename", async (ctx) => {
        const updated = await ctx.editChatInviteLink(link.invite_link, { name: "New Name" });
        await ctx.reply(`Renamed to: ${updated.name}`);
      });

      const response = await testBot.sendCommand(admin, group, "/rename");

      expect(response.text).toBe("Renamed to: New Name");
    });

    it("should edit invite link limits", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setBotAdmin(group, { can_invite_users: true });

      const link = testBot.server.chatState.createInviteLink(group.id, admin, {
        member_limit: 10,
      });

      testBot.command("expand", async (ctx) => {
        const updated = await ctx.editChatInviteLink(link.invite_link, { member_limit: 100 });
        await ctx.reply(`New limit: ${updated.member_limit}`);
      });

      const response = await testBot.sendCommand(admin, group, "/expand");

      expect(response.text).toBe("New limit: 100");
    });
  });

  describe("Revoke Invite Link", () => {
    it("should revoke an invite link", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setBotAdmin(group, { can_invite_users: true });

      const link = testBot.server.chatState.createInviteLink(group.id, admin, {
        name: "To Revoke",
      });

      testBot.command("revoke", async (ctx) => {
        const revoked = await ctx.revokeChatInviteLink(link.invite_link);
        await ctx.reply(`Revoked: ${revoked.is_revoked}`);
      });

      const response = await testBot.sendCommand(admin, group, "/revoke");

      expect(response.text).toBe("Revoked: true");

      const updatedLink = testBot.server.chatState.getInviteLink(group.id, link.invite_link);
      expect(updatedLink?.is_revoked).toBe(true);
    });
  });

  describe("Export Chat Invite Link", () => {
    it("should export primary invite link", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setBotAdmin(group, { can_invite_users: true });

      testBot.command("primary", async (ctx) => {
        const link = await ctx.exportChatInviteLink();
        await ctx.reply(`Primary: ${link}`);
      });

      const response = await testBot.sendCommand(admin, group, "/primary");

      expect(response.text).toContain("Primary:");
      expect(response.text).toContain("https://t.me/");
    });
  });

  describe("Join via Link", () => {
    it("should allow user to join via invite link", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const newUser = testBot.createUser({ first_name: "NewUser" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);

      const link = testBot.server.chatState.createInviteLink(group.id, admin, {});

      await testBot.simulateJoinViaLink(newUser, group, link.invite_link);

      const member = testBot.server.memberState.getMember(group.id, newUser.id);
      expect(member?.status).toBe("member");
    });

    it("should track link usage count", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);

      const link = testBot.server.chatState.createInviteLink(group.id, admin, {});

      // Multiple users join
      const user1 = testBot.createUser({ first_name: "User1" });
      const user2 = testBot.createUser({ first_name: "User2" });
      const user3 = testBot.createUser({ first_name: "User3" });

      await testBot.simulateJoinViaLink(user1, group, link.invite_link);
      await testBot.simulateJoinViaLink(user2, group, link.invite_link);
      await testBot.simulateJoinViaLink(user3, group, link.invite_link);

      const updatedLink = testBot.server.chatState.getInviteLink(group.id, link.invite_link);
      expect(updatedLink?.usage_count).toBe(3);
    });

    it("should respect member limit", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);

      const link = testBot.server.chatState.createInviteLink(group.id, admin, {
        member_limit: 2,
      });

      const user1 = testBot.createUser({ first_name: "User1" });
      const user2 = testBot.createUser({ first_name: "User2" });
      const user3 = testBot.createUser({ first_name: "User3" });

      await testBot.simulateJoinViaLink(user1, group, link.invite_link);
      await testBot.simulateJoinViaLink(user2, group, link.invite_link);

      // Third user should fail (limit reached)
      const result = await testBot.simulateJoinViaLink(user3, group, link.invite_link);
      expect(result.error).toBeDefined();
      expect(result.error?.description).toContain("limit");
    });

    it("should reject revoked links", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const newUser = testBot.createUser({ first_name: "NewUser" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);

      const link = testBot.server.chatState.createInviteLink(group.id, admin, {});
      testBot.server.chatState.revokeInviteLink(group.id, link.invite_link);

      const result = await testBot.simulateJoinViaLink(newUser, group, link.invite_link);
      expect(result.error).toBeDefined();
      expect(result.error?.description).toContain("revoked");
    });

    it("should reject expired links", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const newUser = testBot.createUser({ first_name: "NewUser" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);

      // Create expired link
      const link = testBot.server.chatState.createInviteLink(group.id, admin, {
        expire_date: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      });

      const result = await testBot.simulateJoinViaLink(newUser, group, link.invite_link);
      expect(result.error).toBeDefined();
      expect(result.error?.description).toContain("expired");
    });
  });

  describe("Join Requests", () => {
    it("should create join request for approval-required links", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const newUser = testBot.createUser({ first_name: "NewUser" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);

      const link = testBot.server.chatState.createInviteLink(group.id, admin, {
        creates_join_request: true,
      });

      let joinRequestReceived = false;

      testBot.on("chat_join_request", (ctx) => {
        joinRequestReceived = true;
        expect(ctx.chatJoinRequest.from.id).toBe(newUser.id);
      });

      await testBot.simulateJoinRequest(newUser, group, link.invite_link);

      expect(joinRequestReceived).toBe(true);

      // User should not be a member yet
      const member = testBot.server.memberState.getMember(group.id, newUser.id);
      expect(member?.status).not.toBe("member");
    });

    it("should approve join request", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const newUser = testBot.createUser({ first_name: "NewUser" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setBotAdmin(group, { can_invite_users: true });

      const link = testBot.server.chatState.createInviteLink(group.id, admin, {
        creates_join_request: true,
      });

      testBot.on("chat_join_request", async (ctx) => {
        await ctx.approveChatJoinRequest(ctx.chatJoinRequest.from.id);
      });

      await testBot.simulateJoinRequest(newUser, group, link.invite_link);

      // User should now be a member
      const member = testBot.server.memberState.getMember(group.id, newUser.id);
      expect(member?.status).toBe("member");
    });

    it("should decline join request", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const newUser = testBot.createUser({ first_name: "NewUser" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setBotAdmin(group, { can_invite_users: true });

      const link = testBot.server.chatState.createInviteLink(group.id, admin, {
        creates_join_request: true,
      });

      testBot.on("chat_join_request", async (ctx) => {
        await ctx.declineChatJoinRequest(ctx.chatJoinRequest.from.id);
      });

      await testBot.simulateJoinRequest(newUser, group, link.invite_link);

      // User should not be a member
      const member = testBot.server.memberState.getMember(group.id, newUser.id);
      expect(member?.status).not.toBe("member");

      // Join request should be removed
      const pendingRequests = testBot.server.chatState.getJoinRequests(group.id);
      expect(pendingRequests.find((r) => r.userId === newUser.id)).toBeUndefined();
    });

    it("should include invite link in join request", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const newUser = testBot.createUser({ first_name: "NewUser" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setBotAdmin(group, { can_invite_users: true });

      const link = testBot.server.chatState.createInviteLink(group.id, admin, {
        creates_join_request: true,
        name: "Tracked Link",
      });

      let receivedInviteLink: string | undefined;

      testBot.on("chat_join_request", async (ctx) => {
        receivedInviteLink = ctx.chatJoinRequest.invite_link?.invite_link;
        await ctx.approveChatJoinRequest(ctx.chatJoinRequest.from.id);
      });

      await testBot.simulateJoinRequest(newUser, group, link.invite_link);

      expect(receivedInviteLink).toBe(link.invite_link);
    });
  });

  describe("Chat Member Updates via Join", () => {
    it("should trigger chat_member update when user joins", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const newUser = testBot.createUser({ first_name: "NewUser" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);

      const link = testBot.server.chatState.createInviteLink(group.id, admin, {});

      let memberUpdateReceived = false;

      testBot.on("chat_member", (ctx) => {
        if (ctx.chatMember.new_chat_member.status === "member") {
          memberUpdateReceived = true;
        }
      });

      await testBot.simulateJoinViaLink(newUser, group, link.invite_link);

      expect(memberUpdateReceived).toBe(true);
    });
  });

  describe("Subscription Links", () => {
    it("should create subscription invite link", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const channel = testBot.createChat({ type: "channel", title: "Premium Channel" });

      testBot.setOwner(channel, admin);
      testBot.setBotAdmin(channel, { can_invite_users: true });

      testBot.command("sublink", async (ctx) => {
        // grammY API: createChatSubscriptionInviteLink(subscription_period, subscription_price, other?)
        const link = await ctx.createChatSubscriptionInviteLink(
          2592000, // 30 days
          100,     // price in stars
          { name: "Monthly Sub" }
        );
        await ctx.reply(`Subscription link: ${link.invite_link}`);
      });

      const response = await testBot.sendCommand(admin, channel, "/sublink");

      expect(response.text).toContain("Subscription link:");

      const links = testBot.server.chatState.getInviteLinks(channel.id);
      expect(links[0].subscription_period).toBe(2592000);
      expect(links[0].subscription_price).toBe(100);
    });

    it("should edit subscription invite link", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const channel = testBot.createChat({ type: "channel", title: "Premium Channel" });

      testBot.setOwner(channel, admin);
      testBot.setBotAdmin(channel, { can_invite_users: true });

      const link = testBot.server.chatState.createInviteLink(channel.id, admin, {
        name: "Old Sub",
        subscriptionPeriod: 2592000,
        subscriptionPrice: 100,
      });

      testBot.command("editsub", async (ctx) => {
        const updated = await ctx.editChatSubscriptionInviteLink(link.invite_link, {
          name: "New Sub Name",
        });
        await ctx.reply(`Updated: ${updated.name}`);
      });

      const response = await testBot.sendCommand(admin, channel, "/editsub");

      expect(response.text).toBe("Updated: New Sub Name");
    });
  });

  describe("Get Chat Administrators", () => {
    it("should include invite link creator in admin list", async () => {
      const owner = testBot.createUser({ first_name: "Owner" });
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, owner);
      testBot.setAdmin(group, admin, { can_invite_users: true });

      testBot.command("admins", async (ctx) => {
        const admins = await ctx.getChatAdministrators();
        const adminNames = admins.map((a) => a.user.first_name);
        await ctx.reply(`Admins: ${adminNames.join(", ")}`);
      });

      const response = await testBot.sendCommand(owner, group, "/admins");

      expect(response.text).toContain("Owner");
      expect(response.text).toContain("Admin");
    });
  });
});
