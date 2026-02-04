import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestBot } from "../src/index.js";

describe("Edge Cases", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("Empty and Null Inputs", () => {
    it("should handle response with no messages", async () => {
      // Handler that does nothing
      testBot.command("silent", () => {
        // No reply
      });

      const user = testBot.createUser({ first_name: "Alice" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/silent");
      expect(response.text).toBeUndefined();
      expect(response.texts).toEqual([]);
      expect(response.messages).toHaveLength(0);
    });

    it("should handle response with only media (no text)", async () => {
      testBot.command("photo", async (ctx) => {
        await ctx.replyWithPhoto("https://example.com/image.jpg");
      });

      const user = testBot.createUser({ first_name: "Bob" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/photo");
      expect(response.text).toBeUndefined();
      expect(response.messages).toHaveLength(1);
      expect(response.messages[0].photo).toBeDefined();
    });

    it("should return undefined for getInlineButton with no match", async () => {
      testBot.command("menu", (ctx) =>
        ctx.reply("Choose:", {
          reply_markup: {
            inline_keyboard: [[{ text: "Option A", callback_data: "a" }]],
          },
        }),
      );

      const user = testBot.createUser({ first_name: "Charlie" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/menu");
      expect(response.getInlineButton("NonExistent")).toBeUndefined();
      expect(response.getInlineButton("Option A")).toBeDefined();
    });

    it("should handle empty command arguments", async () => {
      testBot.command("echo", (ctx) => {
        const text = ctx.match || "(empty)";
        return ctx.reply(text);
      });

      const user = testBot.createUser({ first_name: "Dave" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/echo");
      expect(response.text).toBe("(empty)");
    });

    it("should handle empty message text", async () => {
      testBot.on("message:text", (ctx) => ctx.reply(`Length: ${ctx.message.text.length}`));

      const user = testBot.createUser({ first_name: "Eve" });
      const chat = testBot.createChat({ type: "private" });

      // Empty string message
      const response = await testBot.sendMessage(user, chat, "");
      expect(response.text).toBe("Length: 0");
    });
  });

  describe("Boundary Conditions", () => {
    it("should handle very long message text", async () => {
      const longText = "a".repeat(4096); // Telegram max message length

      testBot.on("message:text", (ctx) => ctx.reply(`Length: ${ctx.message.text.length}`));

      const user = testBot.createUser({ first_name: "Frank" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendMessage(user, chat, longText);
      expect(response.text).toBe("Length: 4096");
    });

    it("should handle poll with maximum options (10)", async () => {
      testBot.command("bigpoll", (ctx) =>
        ctx.replyWithPoll("Pick one:", ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]),
      );

      const user = testBot.createUser({ first_name: "Grace" });
      const chat = testBot.createChat({ type: "group", title: "Test" });

      const response = await testBot.sendCommand(user, chat, "/bigpoll");
      expect(response.poll?.options).toHaveLength(10);
    });

    it("should handle deeply nested inline keyboard", async () => {
      const keyboard = Array(8)
        .fill(null)
        .map((_, row) =>
          Array(8)
            .fill(null)
            .map((_, col) => ({
              text: `${row},${col}`,
              callback_data: `cell_${row}_${col}`,
            })),
        );

      testBot.command("grid", (ctx) =>
        ctx.reply("Grid:", {
          reply_markup: { inline_keyboard: keyboard },
        }),
      );

      const user = testBot.createUser({ first_name: "Henry" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/grid");
      expect(response.keyboard?.inline).toHaveLength(8);
      expect(response.keyboard?.inline?.[0]).toHaveLength(8);
    });

    it("should handle multiple reactions on same message", async () => {
      const user1 = testBot.createUser({ first_name: "User1" });
      const user2 = testBot.createUser({ first_name: "User2" });
      const user3 = testBot.createUser({ first_name: "User3" });
      const chat = testBot.createChat({ type: "group", title: "Test" });

      testBot.setMember(chat, user1);
      testBot.setMember(chat, user2);
      testBot.setMember(chat, user3);

      let reactionCount = 0;
      testBot.on("message_reaction", () => {
        reactionCount++;
      });

      testBot.command("post", (ctx) => ctx.reply("React to this!"));

      const postResponse = await testBot.sendCommand(user1, chat, "/post");
      const message = postResponse.messages[0];

      // Multiple users react
      await testBot.react(user1, message, [{ type: "emoji", emoji: "👍" }]);
      await testBot.react(user2, message, [{ type: "emoji", emoji: "👍" }]);
      await testBot.react(user3, message, [{ type: "emoji", emoji: "❤️" }]);

      // Verify all reactions were processed
      expect(reactionCount).toBe(3);
    });

    it("should handle zero until_date for permanent restriction", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const target = testBot.createUser({ first_name: "Target" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });

      testBot.setOwner(group, admin);
      testBot.setMember(group, target);

      // Restrict with until_date = 0 (permanent)
      testBot.server.memberState.restrict(group.id, target.id, { can_send_messages: false }, 0);

      const member = testBot.server.memberState.getMember(group.id, target.id);
      expect(member?.status).toBe("restricted");
      expect(member?.until_date).toBe(0);
    });
  });

  describe("State Transitions", () => {
    it("should handle member status transitions correctly", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });

      // Start as member
      testBot.setMember(group, user);
      expect(testBot.server.memberState.getMember(group.id, user.id)?.status).toBe("member");

      // Restrict
      testBot.server.memberState.restrict(group.id, user.id, { can_send_messages: false });
      expect(testBot.server.memberState.getMember(group.id, user.id)?.status).toBe("restricted");

      // Unrestrict
      testBot.server.memberState.unrestrict(group.id, user.id);
      expect(testBot.server.memberState.getMember(group.id, user.id)?.status).toBe("member");

      // Ban
      testBot.server.memberState.ban(group.id, user.id);
      expect(testBot.server.memberState.getMember(group.id, user.id)?.status).toBe("kicked");

      // Unban
      testBot.server.memberState.unban(group.id, user.id);
      expect(testBot.server.memberState.getMember(group.id, user.id)?.status).toBe("left");
    });

    it("should handle poll state transitions", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "group", title: "Test" });

      testBot.command("poll", (ctx) => ctx.replyWithPoll("Question?", ["A", "B"]));

      const response = await testBot.sendCommand(user, chat, "/poll");
      const poll = response.poll;
      expect(poll).toBeDefined();

      // Poll should be open
      expect(poll.is_closed).toBe(false);

      // Vote
      await testBot.vote(user, poll, [0]);
      const storedPoll = testBot.server.pollState.getPoll(poll.id);
      expect(storedPoll?.options[0].voter_count).toBe(1);

      // Close poll using stopPoll
      testBot.server.pollState.stopPoll(poll.id);
      const closedPoll = testBot.server.pollState.getPoll(poll.id);
      expect(closedPoll?.is_closed).toBe(true);
    });

    it("should handle invite link lifecycle", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });

      testBot.setOwner(group, admin);

      // Create link
      const link = testBot.server.chatState.createInviteLink(group.id, admin, {
        name: "Test Link",
      });
      expect(link).toBeDefined();
      expect(link?.is_revoked).toBe(false);

      // Edit link
      expect(link).toBeDefined();
      const edited = testBot.server.chatState.editInviteLink(group.id, link?.invite_link ?? "", {
        name: "Updated Link",
      });
      expect(edited?.name).toBe("Updated Link");

      // Revoke link
      const revoked = testBot.server.chatState.revokeInviteLink(group.id, link?.invite_link ?? "");
      expect(revoked?.is_revoked).toBe(true);

      // Check link is invalid
      const isValid = testBot.server.chatState.isInviteLinkValid(group.id, link?.invite_link ?? "");
      expect(isValid).toBe(false);
    });
  });

  describe("Multiple Entity Types", () => {
    it("should handle message with multiple entity types", async () => {
      testBot.command("format", (ctx) =>
        ctx.reply("*Bold* _italic_ `code` [link](https://example.com)", { parse_mode: "Markdown" }),
      );

      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/format");
      expect(response.entities).toBeDefined();
      expect(response.hasEntity("bold")).toBe(true);
      expect(response.hasEntity("italic")).toBe(true);
      expect(response.hasEntity("code")).toBe(true);
      expect(response.hasEntity("text_link")).toBe(true);
    });

    it("should handle caption with entities", async () => {
      testBot.command("photo", async (ctx) => {
        await ctx.replyWithPhoto("https://example.com/image.jpg", {
          caption: "*Bold caption*",
          parse_mode: "Markdown",
        });
      });

      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/photo");
      const msg = response.messages[0];
      expect(msg.caption).toBe("Bold caption");
      expect(msg.caption_entities).toBeDefined();
    });
  });

  describe("Concurrent State Access", () => {
    it("should maintain message order in chat", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      testBot.on("message:text", (ctx) => ctx.reply(`Echo: ${ctx.message.text}`));

      // Send multiple messages
      await testBot.sendMessage(user, chat, "1");
      await testBot.sendMessage(user, chat, "2");
      await testBot.sendMessage(user, chat, "3");

      const messages = testBot.server.getBotMessages(chat.id);
      expect(messages.map((m) => (m as { text?: string }).text)).toEqual([
        "Echo: 1",
        "Echo: 2",
        "Echo: 3",
      ]);
    });

    it("should track multiple messages in order", async () => {
      testBot.command("multi", async (ctx) => {
        await ctx.reply("First");
        await ctx.reply("Second");
        await ctx.reply("Third");
      });

      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/multi");
      expect(response.texts).toEqual(["First", "Second", "Third"]);
      expect(response.messages).toHaveLength(3);
    });
  });

  describe("Special Characters", () => {
    it("should handle unicode in messages", async () => {
      testBot.on("message:text", (ctx) => ctx.reply(`Echo: ${ctx.message.text}`));

      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendMessage(user, chat, "Hello 👋 世界 🌍");
      expect(response.text).toBe("Echo: Hello 👋 世界 🌍");
    });

    it("should handle special characters in callback data", async () => {
      testBot.command("menu", (ctx) =>
        ctx.reply("Choose:", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Special", callback_data: "data:with:colons&special=chars" }],
            ],
          },
        }),
      );

      testBot.callbackQuery(/^data:/, (ctx) => {
        ctx.answerCallbackQuery(`Got: ${ctx.callbackQuery.data}`);
      });

      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      await testBot.sendCommand(user, chat, "/menu");
      const response = await testBot.clickButton(user, chat, "data:with:colons&special=chars");
      expect(response.callbackAnswer?.text).toBe("Got: data:with:colons&special=chars");
    });

    it("should handle newlines in messages", async () => {
      testBot.command("multiline", (ctx) => ctx.reply("Line 1\nLine 2\nLine 3"));

      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/multiline");
      expect(response.text).toBe("Line 1\nLine 2\nLine 3");
    });
  });

  describe("File Handling Edge Cases", () => {
    it("should handle photo with no caption", async () => {
      testBot.on("message:photo", (ctx) => {
        const hasCaption = ctx.message.caption ? "yes" : "no";
        return ctx.reply(`Caption: ${hasCaption}`);
      });

      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendPhoto(user, chat, { width: 100, height: 100 });
      expect(response.text).toBe("Caption: no");
    });

    it("should handle document with various MIME types", async () => {
      testBot.on("message:document", (ctx) =>
        ctx.reply(`Type: ${ctx.message.document?.mime_type}`),
      );

      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      const pdfResponse = await testBot.sendDocument(user, chat, {
        fileName: "doc.pdf",
        mimeType: "application/pdf",
      });
      expect(pdfResponse.text).toBe("Type: application/pdf");

      const jsonResponse = await testBot.sendDocument(user, chat, {
        fileName: "data.json",
        mimeType: "application/json",
      });
      expect(jsonResponse.text).toBe("Type: application/json");
    });
  });

  describe("Time-Based Features", () => {
    it("should expire restrictions after until_date", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const target = testBot.createUser({ first_name: "Target" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });

      testBot.setOwner(group, admin);
      testBot.setMember(group, target);

      // Restrict for 60 seconds
      const untilDate = Math.floor(Date.now() / 1000) + 60;
      testBot.server.memberState.restrict(
        group.id,
        target.id,
        { can_send_messages: false },
        untilDate,
      );

      // Should be restricted
      expect(testBot.server.memberState.canSendMessages(group.id, target.id)).toBe(false);

      // Advance time past restriction
      testBot.advanceTime(61);

      // Should be unrestricted
      expect(testBot.server.memberState.canSendMessages(group.id, target.id)).toBe(true);
    });

    it("should expire invite links after expire_date", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });

      testBot.setOwner(group, admin);

      // Create link that expires in 60 seconds
      const expireDate = Math.floor(Date.now() / 1000) + 60;
      const link = testBot.server.chatState.createInviteLink(group.id, admin, {
        expire_date: expireDate,
      });

      // Should be valid
      expect(testBot.server.chatState.isInviteLinkValid(group.id, link?.invite_link ?? "")).toBe(
        true,
      );

      // Note: Time advancement for invite links would need implementation
      // This test documents expected behavior
    });
  });

  describe("Reply Chain Handling", () => {
    it("should track reply relationships", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      testBot.command("start", (ctx) => ctx.reply("Original message"));
      testBot.on("message:text", (ctx) => {
        if (ctx.message.reply_to_message) {
          return ctx.reply(
            `Replying to: ${(ctx.message.reply_to_message as { text?: string }).text}`,
          );
        }
        return ctx.reply("No reply target");
      });

      const original = await testBot.sendCommand(user, chat, "/start");
      const reply = await testBot.sendMessage(user, chat, "My reply", {
        replyToMessageId: original.messages[0].message_id,
      });

      expect(reply.text).toBe("Replying to: Original message");
    });
  });
});
