import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { TestBot } from "../src/index.js";
import { createBot } from "../examples/full-featured-bot/bot.js";
import type { MyContext } from "../examples/full-featured-bot/types.js";
import { createInitialSessionData } from "../examples/full-featured-bot/types.js";
import {
  orderConversation,
  verifyAgeConversation,
  feedbackConversation,
  settingsConversation,
} from "../examples/full-featured-bot/conversations.js";

describe("Full-Featured Bot", () => {
  let testBot: TestBot<MyContext>;

  beforeEach(() => {
    testBot = new TestBot<MyContext>();

    // Set up session middleware
    testBot.use(
      session({
        initial: createInitialSessionData,
      })
    );

    // Set up conversations middleware
    testBot.use(conversations());

    // Register conversation handlers
    testBot.use(createConversation(orderConversation));
    testBot.use(createConversation(verifyAgeConversation));
    testBot.use(createConversation(feedbackConversation));
    testBot.use(createConversation(settingsConversation));

    // Apply the bot handlers (skips middleware since we pass existing bot)
    createBot(testBot);
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("Basic Commands", () => {
    it("responds to /start with personalized greeting", async () => {
      const user = testBot.createUser({ first_name: "Alice" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/start");

      expect(response.text).toContain("Welcome, Alice!");
      expect(response.text).toContain("Use /help");
    });

    it("responds to /help with formatted command list", async () => {
      const user = testBot.createUser({ first_name: "Bob" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/help");

      expect(response.text).toContain("Available Commands");
      expect(response.hasEntity("bold")).toBe(true);
    });

    it("echoes with /echo", async () => {
      const user = testBot.createUser({ first_name: "Charlie" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/echo Hello World");

      expect(response.text).toBe("Echo: Hello World");
    });

    it("echoes nothing when no text provided", async () => {
      const user = testBot.createUser({ first_name: "Dave" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/echo");

      expect(response.text).toBe("Echo: Nothing to echo");
    });

    it("tracks stats with /stats", async () => {
      const user = testBot.createUser({ first_name: "Eve" });
      const chat = testBot.createChat({ type: "private" });

      // Send a few commands
      await testBot.sendCommand(user, chat, "/start");
      await testBot.sendCommand(user, chat, "/echo test");
      const response = await testBot.sendCommand(user, chat, "/stats");

      expect(response.text).toContain("Messages sent:");
      expect(response.text).toContain("Commands used:");
    });
  });

  describe("Formatted Messages", () => {
    it("sends MarkdownV2 formatted message", async () => {
      const user = testBot.createUser({ first_name: "Eve" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/format");

      expect(response.hasEntity("bold")).toBe(true);
      expect(response.hasEntity("italic")).toBe(true);
      expect(response.hasEntity("code")).toBe(true);
    });

    it("sends HTML formatted message", async () => {
      const user = testBot.createUser({ first_name: "Frank" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/html");

      expect(response.hasEntity("bold")).toBe(true);
      expect(response.hasEntity("italic")).toBe(true);
    });
  });

  describe("Inline Keyboards", () => {
    it("shows menu with inline keyboard", async () => {
      const user = testBot.createUser({ first_name: "Grace" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/menu");

      expect(response.text).toBe("Choose an option:");
      expect(response.keyboard?.inline).toBeDefined();
      expect(response.keyboard!.inline![0]).toHaveLength(2);
      expect(response.keyboard!.inline![0][0].text).toBe("Option A");
    });

    it("handles option A selection", async () => {
      const user = testBot.createUser({ first_name: "Harry" });
      const chat = testBot.createChat({ type: "private" });

      const menuResponse = await testBot.sendCommand(user, chat, "/menu");
      const response = await testBot.clickButton(user, chat, "menu_a", menuResponse.messages[0]);

      expect(response.callbackAnswer?.text).toBe("You chose A!");
      expect(response.editedText).toBe("You selected Option A");
    });

    it("handles cancel button", async () => {
      const user = testBot.createUser({ first_name: "Jack" });
      const chat = testBot.createChat({ type: "private" });

      const menuResponse = await testBot.sendCommand(user, chat, "/menu");
      const response = await testBot.clickButton(user, chat, "menu_cancel", menuResponse.messages[0]);

      expect(response.callbackAnswer?.text).toBe("Cancelled");
      expect(response.deletedMessages).toHaveLength(1);
    });
  });

  describe("Reply Keyboards", () => {
    it("shows keyboard with /keyboard", async () => {
      const user = testBot.createUser({ first_name: "Kate" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/keyboard");

      expect(response.text).toBe("Quick actions:");
      expect(response.keyboard?.reply).toBeDefined();
    });

    it("handles Help button", async () => {
      const user = testBot.createUser({ first_name: "Leo" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendMessage(user, chat, "Help");

      expect(response.text).toBe("Use /help for available commands");
    });

    it("handles Cancel button and removes keyboard", async () => {
      const user = testBot.createUser({ first_name: "Mike" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendMessage(user, chat, "Cancel");

      expect(response.text).toBe("Keyboard removed.");
    });
  });

  describe("Admin Commands", () => {
    it("rejects /ban from non-admin", async () => {
      const member = testBot.createUser({ first_name: "Member" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setMember(group, member);

      const response = await testBot.sendCommand(member, group, "/ban");

      expect(response.text).toBe("This command is for group admins only.");
    });

    it("allows /ban from admin", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const target = testBot.createUser({ first_name: "Target" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setMember(group, target);
      testBot.setBotAdmin(group, { can_restrict_members: true });

      const targetMsg = await testBot.sendMessage(target, group, "I'm being naughty");

      const response = await testBot.sendCommand(admin, group, "/ban", {
        replyToMessageId: targetMsg.sentMessage!.message_id,
      });

      expect(response.text).toBe("User has been banned.");

      const targetMember = testBot.server.memberState.getMember(group.id, target.id);
      expect(targetMember?.status).toBe("kicked");
    });

    it("kicks user with /kick", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const target = testBot.createUser({ first_name: "Target" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setMember(group, target);
      testBot.setBotAdmin(group, { can_restrict_members: true });

      const targetMsg = await testBot.sendMessage(target, group, "Message");

      const response = await testBot.sendCommand(admin, group, "/kick", {
        replyToMessageId: targetMsg.sentMessage!.message_id,
      });

      expect(response.text).toBe("User has been kicked.");
    });

    it("mutes user with /mute", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const target = testBot.createUser({ first_name: "Target" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setMember(group, target);
      testBot.setBotAdmin(group, { can_restrict_members: true });

      const targetMsg = await testBot.sendMessage(target, group, "Message");

      const response = await testBot.sendCommand(admin, group, "/mute 60", {
        replyToMessageId: targetMsg.sentMessage!.message_id,
      });

      expect(response.text).toBe("User muted for 60 seconds.");

      const member = testBot.server.memberState.getMember(group.id, target.id);
      expect(member?.restrictedPermissions?.can_send_messages).toBe(false);
    });

    it("unmutes user with /unmute", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const target = testBot.createUser({ first_name: "Target" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setBotAdmin(group, { can_restrict_members: true });
      testBot.server.memberState.setMember(group.id, target);
      testBot.server.memberState.restrict(group.id, target.id, {
        can_send_messages: false,
      });

      const targetMsg = await testBot.sendMessage(target, group, "Message");

      const response = await testBot.sendCommand(admin, group, "/unmute", {
        replyToMessageId: targetMsg.sentMessage!.message_id,
      });

      expect(response.text).toBe("User unmuted.");
    });
  });

  describe("Owner Commands", () => {
    it("rejects /promote from non-owner", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setAdmin(group, admin, { can_restrict_members: true });

      const response = await testBot.sendCommand(admin, group, "/promote");

      expect(response.text).toBe("This command is for the group owner only.");
    });

    it("promotes user to admin", async () => {
      const owner = testBot.createUser({ first_name: "Owner" });
      const target = testBot.createUser({ first_name: "Target" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, owner);
      testBot.setMember(group, target);
      testBot.setBotAdmin(group, { can_promote_members: true });

      const targetMsg = await testBot.sendMessage(target, group, "Message");

      const response = await testBot.sendCommand(owner, group, "/promote", {
        replyToMessageId: targetMsg.sentMessage!.message_id,
      });

      expect(response.text).toBe("User promoted to admin.");

      const member = testBot.server.memberState.getMember(group.id, target.id);
      expect(member?.status).toBe("administrator");
    });

    it("demotes admin", async () => {
      const owner = testBot.createUser({ first_name: "Owner" });
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, owner);
      testBot.setAdmin(group, admin, { can_delete_messages: true });
      testBot.setBotAdmin(group, { can_promote_members: true });

      const adminMsg = await testBot.sendMessage(admin, group, "Message");

      const response = await testBot.sendCommand(owner, group, "/demote", {
        replyToMessageId: adminMsg.sentMessage!.message_id,
      });

      expect(response.text).toBe("Admin demoted to member.");
    });
  });

  describe("Chat Settings", () => {
    it("locks chat", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setBotAdmin(group, { can_restrict_members: true });

      const response = await testBot.sendCommand(admin, group, "/lock");

      expect(response.text).toContain("Chat locked");

      const chatData = testBot.server.chatState.getOrCreate(group);
      expect(chatData.permissions?.can_send_messages).toBe(false);
    });

    it("unlocks chat", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setBotAdmin(group, { can_restrict_members: true });
      testBot.server.chatState.setChatPermissions(group.id, { can_send_messages: false });

      const response = await testBot.sendCommand(admin, group, "/unlock");

      expect(response.text).toBe("Chat unlocked.");

      const chatData = testBot.server.chatState.getOrCreate(group);
      expect(chatData.permissions?.can_send_messages).toBe(true);
    });
  });

  describe("Invite Links", () => {
    it("creates invite link", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setBotAdmin(group, { can_invite_users: true });

      const response = await testBot.sendCommand(admin, group, "/invite");

      expect(response.text).toContain("Invite link:");
      expect(response.text).toContain("https://t.me/");

      const links = testBot.server.chatState.getInviteLinks(group.id);
      expect(links).toHaveLength(1);
      expect(links[0].name).toBe("Public Invite");
      expect(links[0].member_limit).toBe(100);
    });
  });

  describe("Polls", () => {
    it("creates programming language poll", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "group", title: "Test Group" });

      const response = await testBot.sendCommand(user, chat, "/poll");

      expect(response.poll).toBeDefined();
      expect(response.poll?.question).toContain("programming language");
      expect(response.poll?.options.length).toBeGreaterThan(3);
      expect(response.poll?.type).toBe("regular");
    });

    it("creates quiz poll", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "group", title: "Test Group" });

      const response = await testBot.sendCommand(user, chat, "/quiz");

      expect(response.poll).toBeDefined();
      expect(response.poll?.question).toContain("grammY");
      expect(response.poll?.type).toBe("quiz");
      expect(response.poll?.correct_option_id).toBe(1);
    });
  });

  describe("File Handling", () => {
    it("receives photo and reports dimensions", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendPhoto(user, chat, {
        width: 1920,
        height: 1080,
      });

      expect(response.text).toContain("Photo received!");
      expect(response.text).toContain("1920x1080");
    });

    it("receives document and reports metadata", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendDocument(user, chat, {
        fileName: "report.pdf",
        mimeType: "application/pdf",
        fileSize: 102400,
      });

      expect(response.text).toContain("Document received!");
      expect(response.text).toContain("report.pdf");
      expect(response.text).toContain("application/pdf");
    });
  });

  describe("Inline Queries", () => {
    it("returns search results", async () => {
      const user = testBot.createUser({ first_name: "User" });

      const response = await testBot.sendInlineQuery(user, "hello");

      expect(response.inlineResults).toBeDefined();
      expect(response.inlineResults!.length).toBeGreaterThan(0);
    });

    it("filters results based on query", async () => {
      const user = testBot.createUser({ first_name: "User" });

      const response = await testBot.sendInlineQuery(user, "time");

      expect(response.inlineResults).toBeDefined();
      // Should find "Current Time" result
      const hasTimeResult = response.inlineResults!.some(
        (r) => r.title?.toLowerCase().includes("time")
      );
      expect(hasTimeResult).toBe(true);
    });
  });

  describe("Payments", () => {
    it("sends premium invoice", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/buy");

      expect(response.invoice).toBeDefined();
      expect(response.invoice?.title).toBe("Premium Subscription");
      expect(response.invoice?.currency).toBe("XTR");
      expect(response.invoice?.total_amount).toBe(100);
    });

    it("handles valid pre-checkout", async () => {
      const user = testBot.createUser({ first_name: "User" });

      const response = await testBot.simulatePreCheckout(user, {
        id: "precheckout_123",
        currency: "XTR",
        total_amount: 100,
        invoice_payload: "premium_30_days",
      });

      expect(response.preCheckoutAnswer?.ok).toBe(true);
    });

    it("rejects invalid pre-checkout", async () => {
      const user = testBot.createUser({ first_name: "User" });

      const response = await testBot.simulatePreCheckout(user, {
        id: "precheckout_456",
        currency: "XTR",
        total_amount: 100,
        invoice_payload: "invalid_product",
      });

      expect(response.preCheckoutAnswer?.ok).toBe(false);
    });

    it("handles successful payment", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.simulateSuccessfulPayment(user, chat, {
        currency: "XTR",
        total_amount: 100,
        invoice_payload: "premium_30_days",
        telegram_payment_charge_id: "charge_123",
        provider_payment_charge_id: "provider_456",
      });

      expect(response.text).toContain("Payment received!");
      expect(response.text).toContain("100 XTR");
    });
  });

  describe("Text Echo", () => {
    it("echoes regular text with formatting", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendMessage(user, chat, "Hello bot!");

      expect(response.text).toContain("You said:");
      expect(response.text).toContain("Hello bot!");
    });
  });

  describe("Pin Messages", () => {
    it("pins a message when replying", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setBotAdmin(group, { can_pin_messages: true });

      const msgResponse = await testBot.sendMessage(admin, group, "Important announcement");

      const response = await testBot.sendCommand(admin, group, "/pin", {
        replyToMessageId: msgResponse.messages[0].message_id,
      });

      expect(response.text).toBe("Message pinned.");
    });

    it("requires reply to pin", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);

      const response = await testBot.sendCommand(admin, group, "/pin");

      expect(response.text).toBe("Reply to a message to pin it.");
    });
  });

  describe("Forum Topics", () => {
    it("creates forum topic", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const forum = testBot.createChat({
        type: "supergroup",
        title: "Forum Group",
        is_forum: true,
      });

      testBot.setOwner(forum, admin);
      testBot.setBotAdmin(forum, { can_manage_topics: true });

      const response = await testBot.sendCommand(admin, forum, "/topic My New Topic");

      expect(response.text).toContain('Forum topic "My New Topic" created!');
    });
  });
});
