import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestBot } from "../src/index.js";

describe("Integration Scenarios", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("E-Commerce Bot Flow", () => {
    it("should handle complete purchase flow", async () => {
      const events: string[] = [];

      // Product catalog
      testBot.command("shop", (ctx) =>
        ctx.reply("Welcome to our shop!", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Premium Plan - $10", callback_data: "buy_premium" }],
              [{ text: "Basic Plan - $5", callback_data: "buy_basic" }],
            ],
          },
        }),
      );

      // Handle product selection
      testBot.callbackQuery(/^buy_/, async (ctx) => {
        const plan = (ctx.callbackQuery.data ?? "").replace("buy_", "");
        events.push(`selected_${plan}`);

        await ctx.answerCallbackQuery();
        await ctx.editMessageText(`You selected: ${plan}`, {
          reply_markup: {
            inline_keyboard: [[{ text: "Confirm Purchase", callback_data: `confirm_${plan}` }]],
          },
        });
      });

      // Handle confirmation - send invoice
      testBot.callbackQuery(/^confirm_/, async (ctx) => {
        const plan = (ctx.callbackQuery.data ?? "").replace("confirm_", "");
        const amount = plan === "premium" ? 1000 : 500;
        events.push("invoice_sent");

        await ctx.answerCallbackQuery("Processing...");
        await ctx.replyWithInvoice(`${plan} Plan`, `${plan} subscription`, `${plan}_sub`, "XTR", [
          { label: `${plan} Plan`, amount },
        ]);
      });

      // Handle pre-checkout
      testBot.on("pre_checkout_query", async (ctx) => {
        events.push("pre_checkout");
        await ctx.answerPreCheckoutQuery(true);
      });

      // Handle successful payment
      testBot.on("message:successful_payment", async (ctx) => {
        events.push("payment_success");
        await ctx.reply("Thank you for your purchase! Your subscription is now active.");
      });

      const user = testBot.createUser({ first_name: "Customer" });
      const chat = testBot.createChat({ type: "private" });

      // Step 1: Browse shop
      const shopResponse = await testBot.sendCommand(user, chat, "/shop");
      expect(shopResponse.keyboard?.inline).toHaveLength(2);

      // Step 2: Select premium plan
      const selectResponse = await testBot.clickButton(
        user,
        chat,
        "buy_premium",
        shopResponse.messages[0],
      );
      expect(selectResponse.editedText).toContain("premium");

      // Step 3: Confirm purchase
      const confirmResponse = await testBot.clickButton(
        user,
        chat,
        "confirm_premium",
        selectResponse.editedMessages[0],
      );
      expect(confirmResponse.invoice).toBeDefined();
      expect(confirmResponse.invoice?.total_amount).toBe(1000);

      // Step 4: Pre-checkout
      const preCheckout = await testBot.simulatePreCheckout(user, {
        id: "checkout_1",
        currency: "XTR",
        total_amount: 1000,
        invoice_payload: "premium_sub",
      });
      expect(preCheckout.preCheckoutAnswer?.ok).toBe(true);

      // Step 5: Payment success
      const paymentResponse = await testBot.simulateSuccessfulPayment(user, chat, {
        currency: "XTR",
        total_amount: 1000,
        invoice_payload: "premium_sub",
        telegram_payment_charge_id: "charge_123",
        provider_payment_charge_id: "provider_456",
      });
      expect(paymentResponse.text).toContain("Thank you");

      // Verify all steps executed
      expect(events).toEqual([
        "selected_premium",
        "invoice_sent",
        "pre_checkout",
        "payment_success",
      ]);
    });
  });

  describe("Moderation Bot Flow", () => {
    it("should handle warn -> mute -> ban progression", async () => {
      const warnings = new Map<number, number>();

      testBot.command("warn", async (ctx) => {
        const replyTo = ctx.message?.reply_to_message;
        if (!replyTo || !replyTo.from) {
          return ctx.reply("Reply to a message to warn the user.");
        }

        const targetId = replyTo.from.id;
        const count = (warnings.get(targetId) || 0) + 1;
        warnings.set(targetId, count);

        if (count >= 3) {
          // Auto-ban after 3 warnings
          await ctx.banChatMember(targetId);
          return ctx.reply(`User banned after ${count} warnings.`);
        } else if (count >= 2) {
          // Mute after 2 warnings
          await ctx.restrictChatMember(targetId, {
            permissions: { can_send_messages: false },
            until_date: Math.floor(Date.now() / 1000) + 3600,
          });
          return ctx.reply(`User muted (warning ${count}/3).`);
        }

        return ctx.reply(`Warning ${count}/3. Next warning will result in a mute.`);
      });

      const admin = testBot.createUser({ first_name: "Admin" });
      const troublemaker = testBot.createUser({ first_name: "Troublemaker" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setMember(group, troublemaker);
      testBot.setBotAdmin(group, { can_restrict_members: true });

      // Troublemaker sends a message
      testBot.on("message:text", () => {});
      const troubleMsg = await testBot.sendMessage(troublemaker, group, "Bad message");

      // Warning 1
      const warn1 = await testBot.sendCommand(admin, group, "/warn", {
        replyToMessageId: troubleMsg.sentMessage?.message_id,
      });
      expect(warn1.text).toContain("Warning 1/3");
      expect(testBot.server.memberState.getMember(group.id, troublemaker.id)?.status).toBe(
        "member",
      );

      // Warning 2 - should mute
      const warn2 = await testBot.sendCommand(admin, group, "/warn", {
        replyToMessageId: troubleMsg.sentMessage?.message_id,
      });
      expect(warn2.text).toContain("muted");
      expect(testBot.server.memberState.getMember(group.id, troublemaker.id)?.status).toBe(
        "restricted",
      );

      // Warning 3 - should ban
      const warn3 = await testBot.sendCommand(admin, group, "/warn", {
        replyToMessageId: troubleMsg.sentMessage?.message_id,
      });
      expect(warn3.text).toContain("banned");
      expect(testBot.server.memberState.getMember(group.id, troublemaker.id)?.status).toBe(
        "kicked",
      );
    });

    it("should handle appeal workflow", async () => {
      const appeals = new Map<number, { reason: string; status: string }>();

      // User appeals ban
      testBot.command("appeal", async (ctx) => {
        const reason = ctx.match || "No reason provided";
        appeals.set(ctx.from.id, { reason, status: "pending" });
        await ctx.reply("Your appeal has been submitted. An admin will review it.");
      });

      // Admin reviews appeal
      testBot.command("review", async (ctx) => {
        const args = ctx.match?.split(" ");
        if (!args || args.length < 2) {
          return ctx.reply("Usage: /review <user_id> <approve|deny>");
        }

        const [userId, decision] = args;
        const appeal = appeals.get(parseInt(userId, 10));

        if (!appeal) {
          return ctx.reply("No appeal found for this user.");
        }

        appeal.status = decision;

        if (decision === "approve") {
          await ctx.api.unbanChatMember(ctx.chat.id, parseInt(userId, 10));
          return ctx.reply(`Appeal approved. User ${userId} has been unbanned.`);
        }

        return ctx.reply(`Appeal denied for user ${userId}.`);
      });

      const admin = testBot.createUser({ first_name: "Admin" });
      const banned = testBot.createUser({ first_name: "Banned" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setMember(group, banned);
      testBot.setBotAdmin(group, { can_restrict_members: true });

      // Ban the user
      testBot.server.memberState.ban(group.id, banned.id);
      expect(testBot.server.memberState.getMember(group.id, banned.id)?.status).toBe("kicked");

      // User submits appeal (in DM)
      const dmChat = testBot.createChat({ type: "private", id: banned.id });
      await testBot.sendCommand(banned, dmChat, "/appeal I promise to behave");

      expect(appeals.get(banned.id)?.reason).toBe("I promise to behave");
      expect(appeals.get(banned.id)?.status).toBe("pending");

      // Admin approves
      const reviewResponse = await testBot.sendCommand(
        admin,
        group,
        `/review ${banned.id} approve`,
      );
      expect(reviewResponse.text).toContain("approved");
      expect(testBot.server.memberState.getMember(group.id, banned.id)?.status).toBe("left");
    });
  });

  describe("Poll-Based Decision Making", () => {
    it("should handle poll creation, voting, and result processing", async () => {
      let pollResult: { question: string; winner: string } | null = null;

      testBot.command("vote", async (ctx) => {
        const question = ctx.match || "What should we do?";
        await ctx.replyWithPoll(question, ["Option A", "Option B", "Option C"], {
          is_anonymous: false,
        });
      });

      testBot.command("results", async (ctx) => {
        // Get the last poll from the chat
        const messages = testBot.server.chatState.get(ctx.chat.id)?.messages || [];
        const pollMessage = messages.find((m) => "poll" in m);

        if (!pollMessage || !("poll" in pollMessage)) {
          return ctx.reply("No poll found.");
        }

        const poll = testBot.server.pollState.getPoll(pollMessage.poll.id);
        if (!poll) {
          return ctx.reply("Poll not found.");
        }

        // Find winner
        let maxVotes = 0;
        let winner = "";
        for (const option of poll.options) {
          if (option.voter_count > maxVotes) {
            maxVotes = option.voter_count;
            winner = option.text;
          }
        }

        pollResult = { question: poll.question, winner };

        // Close the poll
        testBot.server.pollState.stopPoll(poll.id);

        await ctx.reply(`Poll closed! Winner: ${winner} with ${maxVotes} votes.`);
      });

      const admin = testBot.createUser({ first_name: "Admin" });
      const voters = Array.from({ length: 5 }, (_, i) =>
        testBot.createUser({ first_name: `Voter${i}` }),
      );
      const group = testBot.createChat({ type: "group", title: "Test Group" });

      testBot.setOwner(group, admin);
      for (const v of voters) {
        testBot.setMember(group, v);
      }

      // Create poll
      const pollResponse = await testBot.sendCommand(admin, group, "/vote Team lunch location?");
      expect(pollResponse.poll?.question).toBe("Team lunch location?");

      expect(pollResponse.poll).toBeDefined();
      const poll = pollResponse.poll;

      // Users vote (3 for A, 2 for B)
      await testBot.vote(voters[0], poll, [0]);
      await testBot.vote(voters[1], poll, [0]);
      await testBot.vote(voters[2], poll, [0]);
      await testBot.vote(voters[3], poll, [1]);
      await testBot.vote(voters[4], poll, [1]);

      // Get results
      const resultsResponse = await testBot.sendCommand(admin, group, "/results");
      expect(resultsResponse.text).toContain("Option A");
      expect(resultsResponse.text).toContain("3 votes");

      expect(pollResult?.winner).toBe("Option A");
    });
  });

  describe("Forum Topic Workflow", () => {
    it("should handle topic creation, messaging, and management", async () => {
      testBot.command("newtopic", async (ctx) => {
        const name = ctx.match || "New Topic";
        const topic = await ctx.createForumTopic(name);
        await ctx.reply(`Created topic: ${topic.name} (ID: ${topic.message_thread_id})`);
      });

      testBot.command("closetopic", async (ctx) => {
        const threadId = parseInt(ctx.match || "0", 10);
        if (!threadId) {
          return ctx.reply("Usage: /closetopic <thread_id>");
        }
        // Use API directly since ctx may not have message_thread_id
        await ctx.api.closeForumTopic(ctx.chat.id, threadId);
        await ctx.reply("Topic closed.");
      });

      testBot.command("reopentopic", async (ctx) => {
        const threadId = parseInt(ctx.match || "0", 10);
        if (!threadId) {
          return ctx.reply("Usage: /reopentopic <thread_id>");
        }
        // Use API directly since ctx may not have message_thread_id
        await ctx.api.reopenForumTopic(ctx.chat.id, threadId);
        await ctx.reply("Topic reopened.");
      });

      const admin = testBot.createUser({ first_name: "Admin" });
      const forum = testBot.createChat({ type: "supergroup", title: "Forum", is_forum: true });

      testBot.setOwner(forum, admin);
      testBot.setBotAdmin(forum, { can_manage_topics: true });

      // Create topic
      const createResponse = await testBot.sendCommand(admin, forum, "/newtopic Bug Reports");
      expect(createResponse.text).toContain("Bug Reports");

      // Extract thread ID from response
      const threadIdMatch = createResponse.text?.match(/ID: (\d+)/);
      const threadId = threadIdMatch ? parseInt(threadIdMatch[1], 10) : 0;
      expect(threadId).toBeGreaterThan(0);

      // Verify topic exists
      const topic = testBot.server.chatState.getForumTopic(forum.id, threadId);
      expect(topic?.name).toBe("Bug Reports");
      expect(topic?.is_closed).toBe(false);

      // Close topic
      await testBot.sendCommand(admin, forum, `/closetopic ${threadId}`);
      const closedTopic = testBot.server.chatState.getForumTopic(forum.id, threadId);
      expect(closedTopic?.is_closed).toBe(true);

      // Reopen topic
      await testBot.sendCommand(admin, forum, `/reopentopic ${threadId}`);
      const reopenedTopic = testBot.server.chatState.getForumTopic(forum.id, threadId);
      expect(reopenedTopic?.is_closed).toBe(false);
    });
  });

  describe("Invite Link Management", () => {
    it("should handle complete invite link lifecycle", async () => {
      testBot.command("createinvite", async (ctx) => {
        const link = await ctx.createChatInviteLink({
          name: ctx.match || "Default",
          member_limit: 10,
        });
        await ctx.reply(`Invite link: ${link.invite_link}`);
      });

      testBot.command("listinvites", async (ctx) => {
        const links = testBot.server.chatState.getInviteLinks(ctx.chat.id);
        const list = links
          .map((l) => `- ${l.name}: ${l.usage_count}/${l.member_limit || "∞"} uses`)
          .join("\n");
        await ctx.reply(`Invite links:\n${list || "None"}`);
      });

      testBot.command("revokeinvite", async (ctx) => {
        const linkUrl = ctx.match;
        if (!linkUrl) {
          return ctx.reply("Usage: /revokeinvite <link>");
        }
        await ctx.revokeChatInviteLink(linkUrl);
        await ctx.reply("Link revoked.");
      });

      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

      testBot.setOwner(group, admin);
      testBot.setBotAdmin(group, { can_invite_users: true });

      // Create invite
      const createResponse = await testBot.sendCommand(admin, group, "/createinvite VIP Access");
      expect(createResponse.text).toContain("Invite link:");

      // Extract link URL
      const linkMatch = createResponse.text?.match(/(https:\/\/t\.me\/\+\S+)/);
      const linkUrl = linkMatch ? linkMatch[1] : "";
      expect(linkUrl).toBeTruthy();

      // Simulate users joining
      const newUsers = Array.from({ length: 3 }, (_, i) =>
        testBot.createUser({ first_name: `NewUser${i}` }),
      );

      for (const user of newUsers) {
        await testBot.simulateJoinViaLink(user, group, linkUrl);
      }

      // Check invite stats
      const listResponse = await testBot.sendCommand(admin, group, "/listinvites");
      expect(listResponse.text).toContain("3/10");

      // Revoke link
      const revokeResponse = await testBot.sendCommand(admin, group, `/revokeinvite ${linkUrl}`);
      expect(revokeResponse.text).toContain("revoked");

      // Try to use revoked link
      const failedUser = testBot.createUser({ first_name: "FailedUser" });
      const joinResponse = await testBot.simulateJoinViaLink(failedUser, group, linkUrl);
      expect(joinResponse.error).toBeDefined();
    });
  });

  describe("Message Edit History", () => {
    it("should track message edits and maintain history", async () => {
      const editHistory: string[] = [];

      testBot.command("post", async (ctx) => {
        const msg = await ctx.reply("Original content");
        editHistory.push("Original content");
        return msg;
      });

      testBot.command("edit", async (ctx) => {
        const newContent = ctx.match || "Edited";
        const messages = testBot.server.getBotMessages(ctx.chat.id);
        const lastMsg = messages[messages.length - 1];

        if (lastMsg) {
          await ctx.api.editMessageText(ctx.chat.id, lastMsg.message_id, newContent);
          editHistory.push(newContent);
        }
      });

      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      // Post original
      await testBot.sendCommand(user, chat, "/post");

      // Edit multiple times
      await testBot.sendCommand(user, chat, "/edit First edit");
      await testBot.sendCommand(user, chat, "/edit Second edit");
      await testBot.sendCommand(user, chat, "/edit Final version");

      expect(editHistory).toEqual([
        "Original content",
        "First edit",
        "Second edit",
        "Final version",
      ]);
    });
  });

  describe("Reaction-Based Features", () => {
    it("should implement like/dislike system", async () => {
      const postLikes = new Map<number, { likes: Set<number>; dislikes: Set<number> }>();

      testBot.command("post", async (ctx) => {
        const msg = await ctx.reply(ctx.match || "New post", {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "👍 0", callback_data: "like" },
                { text: "👎 0", callback_data: "dislike" },
              ],
            ],
          },
        });
        postLikes.set(msg.message_id, { likes: new Set(), dislikes: new Set() });
      });

      testBot.callbackQuery(/^(like|dislike)$/, async (ctx) => {
        const msg = ctx.callbackQuery.message;
        if (!msg) return;
        const data = postLikes.get(msg.message_id);
        if (!data) return;

        const userId = ctx.from.id;
        const action = ctx.callbackQuery.data;

        // Toggle like/dislike
        if (action === "like") {
          data.dislikes.delete(userId);
          if (data.likes.has(userId)) {
            data.likes.delete(userId);
          } else {
            data.likes.add(userId);
          }
        } else {
          data.likes.delete(userId);
          if (data.dislikes.has(userId)) {
            data.dislikes.delete(userId);
          } else {
            data.dislikes.add(userId);
          }
        }

        // Update button counts
        await ctx.editMessageReplyMarkup({
          inline_keyboard: [
            [
              { text: `👍 ${data.likes.size}`, callback_data: "like" },
              { text: `👎 ${data.dislikes.size}`, callback_data: "dislike" },
            ],
          ],
        });

        await ctx.answerCallbackQuery();
      });

      const poster = testBot.createUser({ first_name: "Poster" });
      const likers = Array.from({ length: 3 }, (_, i) =>
        testBot.createUser({ first_name: `Liker${i}` }),
      );
      const chat = testBot.createChat({ type: "group", title: "Test" });

      testBot.setMember(chat, poster);
      for (const l of likers) {
        testBot.setMember(chat, l);
      }

      // Create post
      const postResponse = await testBot.sendCommand(poster, chat, "/post Check this out!");
      const postMessage = postResponse.messages[0];

      // Users like the post
      for (const liker of likers) {
        await testBot.clickButton(liker, chat, "like", postMessage);
      }

      // Check final state
      const data = postLikes.get(postMessage.message_id);
      expect(data?.likes.size).toBe(3);
      expect(data?.dislikes.size).toBe(0);

      // One user changes to dislike
      await testBot.clickButton(likers[0], chat, "dislike", postMessage);
      expect(postLikes.get(postMessage.message_id)?.likes.size).toBe(2);
      expect(postLikes.get(postMessage.message_id)?.dislikes.size).toBe(1);
    });
  });

  describe("Multi-Step Registration", () => {
    it("should handle complete registration flow with validation", async () => {
      const registrations = new Map<
        number,
        {
          step: string;
          data: { name?: string; email?: string; age?: number };
        }
      >();

      testBot.on("message:text", async (ctx) => {
        const userId = ctx.from.id;
        const reg = registrations.get(userId) || { step: "idle", data: {} };

        if (ctx.message.text === "/register") {
          registrations.set(userId, { step: "name", data: {} });
          return ctx.reply("Welcome! Please enter your name:");
        }

        if (ctx.message.text === "/cancel") {
          registrations.delete(userId);
          return ctx.reply("Registration cancelled.");
        }

        switch (reg.step) {
          case "name":
            if (ctx.message.text.length < 2) {
              return ctx.reply("Name too short. Please enter at least 2 characters:");
            }
            reg.data.name = ctx.message.text;
            reg.step = "email";
            registrations.set(userId, reg);
            return ctx.reply("Great! Now enter your email:");

          case "email":
            if (!ctx.message.text.includes("@")) {
              return ctx.reply("Invalid email. Please enter a valid email:");
            }
            reg.data.email = ctx.message.text;
            reg.step = "age";
            registrations.set(userId, reg);
            return ctx.reply("Almost done! Enter your age:");

          case "age": {
            const age = parseInt(ctx.message.text, 10);
            if (Number.isNaN(age) || age < 13 || age > 120) {
              return ctx.reply("Invalid age. Please enter a number between 13 and 120:");
            }
            reg.data.age = age;
            reg.step = "complete";
            registrations.set(userId, reg);
            return ctx.reply(
              `Registration complete!\nName: ${reg.data.name}\nEmail: ${reg.data.email}\nAge: ${reg.data.age}`,
            );
          }

          default:
            return ctx.reply("Send /register to start registration or /help for more info.");
        }
      });

      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      // Start registration
      let response = await testBot.sendCommand(user, chat, "/register");
      expect(response.text).toContain("enter your name");

      // Invalid name (too short)
      response = await testBot.sendMessage(user, chat, "A");
      expect(response.text).toContain("too short");

      // Valid name
      response = await testBot.sendMessage(user, chat, "Alice");
      expect(response.text).toContain("email");

      // Invalid email
      response = await testBot.sendMessage(user, chat, "notanemail");
      expect(response.text).toContain("Invalid email");

      // Valid email
      response = await testBot.sendMessage(user, chat, "alice@example.com");
      expect(response.text).toContain("age");

      // Invalid age
      response = await testBot.sendMessage(user, chat, "5");
      expect(response.text).toContain("Invalid age");

      // Valid age
      response = await testBot.sendMessage(user, chat, "25");
      expect(response.text).toContain("Registration complete");
      expect(response.text).toContain("Alice");
      expect(response.text).toContain("alice@example.com");
      expect(response.text).toContain("25");

      // Verify final state
      const reg = registrations.get(user.id);
      expect(reg?.step).toBe("complete");
      expect(reg?.data).toEqual({
        name: "Alice",
        email: "alice@example.com",
        age: 25,
      });
    });
  });
});
