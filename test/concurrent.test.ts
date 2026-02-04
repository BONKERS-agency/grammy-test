import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestBot } from "../src/index.js";

describe("Concurrent Interactions", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("Sequential Button Clicks", () => {
    it("should handle multiple users clicking same button sequentially", async () => {
      const clickOrder: string[] = [];

      testBot.command("vote", (ctx) =>
        ctx.reply("Vote:", {
          reply_markup: {
            inline_keyboard: [[{ text: "Vote A", callback_data: "vote_a" }]],
          },
        }),
      );

      testBot.callbackQuery("vote_a", async (ctx) => {
        clickOrder.push(ctx.from.first_name);
        await ctx.answerCallbackQuery(`Thanks ${ctx.from.first_name}!`);
      });

      const user1 = testBot.createUser({ first_name: "Alice" });
      const user2 = testBot.createUser({ first_name: "Bob" });
      const user3 = testBot.createUser({ first_name: "Charlie" });
      const chat = testBot.createChat({ type: "group", title: "Test" });

      testBot.setMember(chat, user1);
      testBot.setMember(chat, user2);
      testBot.setMember(chat, user3);

      // Post the vote message
      const voteMsg = await testBot.sendCommand(user1, chat, "/vote");
      const message = voteMsg.messages[0];

      // Multiple users click sequentially
      const response1 = await testBot.clickButton(user1, chat, "vote_a", message);
      const response2 = await testBot.clickButton(user2, chat, "vote_a", message);
      const response3 = await testBot.clickButton(user3, chat, "vote_a", message);

      // All should receive their personalized answers
      expect(response1.callbackAnswer?.text).toBe("Thanks Alice!");
      expect(response2.callbackAnswer?.text).toBe("Thanks Bob!");
      expect(response3.callbackAnswer?.text).toBe("Thanks Charlie!");

      // All clicks should be recorded in order
      expect(clickOrder).toEqual(["Alice", "Bob", "Charlie"]);
    });

    it("should handle rapid button clicks from same user", async () => {
      let clickCount = 0;

      testBot.command("counter", (ctx) =>
        ctx.reply("Click me:", {
          reply_markup: {
            inline_keyboard: [[{ text: "Click", callback_data: "click" }]],
          },
        }),
      );

      testBot.callbackQuery("click", async (ctx) => {
        clickCount++;
        await ctx.answerCallbackQuery(`Click #${clickCount}`);
      });

      const user = testBot.createUser({ first_name: "Rapid" });
      const chat = testBot.createChat({ type: "private" });

      const counterMsg = await testBot.sendCommand(user, chat, "/counter");
      const message = counterMsg.messages[0];

      // Sequential rapid clicks
      const responses = [];
      for (let i = 0; i < 5; i++) {
        responses.push(await testBot.clickButton(user, chat, "click", message));
      }

      // All clicks should be processed
      expect(clickCount).toBe(5);
      expect(responses[0].callbackAnswer?.text).toBe("Click #1");
      expect(responses[4].callbackAnswer?.text).toBe("Click #5");
    });

    it("should handle clicks on different buttons", async () => {
      const votes = { a: 0, b: 0, c: 0 };

      testBot.command("poll", (ctx) =>
        ctx.reply("Pick one:", {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "A", callback_data: "pick_a" },
                { text: "B", callback_data: "pick_b" },
                { text: "C", callback_data: "pick_c" },
              ],
            ],
          },
        }),
      );

      testBot.callbackQuery(/^pick_/, async (ctx) => {
        const choice = (ctx.callbackQuery.data ?? "").split("_")[1] as "a" | "b" | "c";
        votes[choice]++;
        await ctx.answerCallbackQuery(`Voted for ${choice.toUpperCase()}`);
      });

      const users = Array.from({ length: 9 }, (_, i) =>
        testBot.createUser({ first_name: `User${i}` }),
      );

      const chat = testBot.createChat({ type: "group", title: "Test" });
      for (const u of users) {
        testBot.setMember(chat, u);
      }

      const pollMsg = await testBot.sendCommand(users[0], chat, "/poll");
      const message = pollMsg.messages[0];

      // Distribute votes across options
      await testBot.clickButton(users[0], chat, "pick_a", message);
      await testBot.clickButton(users[1], chat, "pick_a", message);
      await testBot.clickButton(users[2], chat, "pick_a", message);
      await testBot.clickButton(users[3], chat, "pick_b", message);
      await testBot.clickButton(users[4], chat, "pick_b", message);
      await testBot.clickButton(users[5], chat, "pick_c", message);
      await testBot.clickButton(users[6], chat, "pick_c", message);
      await testBot.clickButton(users[7], chat, "pick_c", message);
      await testBot.clickButton(users[8], chat, "pick_c", message);

      expect(votes).toEqual({ a: 3, b: 2, c: 4 });
    });
  });

  describe("Concurrent Messages", () => {
    it("should handle multiple users sending messages simultaneously", async () => {
      const receivedMessages: string[] = [];

      testBot.on("message:text", async (ctx) => {
        receivedMessages.push(`${ctx.from.first_name}: ${ctx.message.text}`);
        await ctx.reply("Got it");
      });

      const users = Array.from({ length: 5 }, (_, i) =>
        testBot.createUser({ first_name: `User${i}` }),
      );

      const chat = testBot.createChat({ type: "group", title: "Test" });
      for (const u of users) {
        testBot.setMember(chat, u);
      }

      // All users send messages concurrently
      await Promise.all(users.map((u, i) => testBot.sendMessage(u, chat, `Message ${i}`)));

      expect(receivedMessages).toHaveLength(5);
      users.forEach((u, i) => {
        expect(receivedMessages).toContain(`${u.first_name}: Message ${i}`);
      });
    });

    it("should handle concurrent messages to different chats", async () => {
      const chatMessages = new Map<number, string[]>();

      testBot.on("message:text", async (ctx) => {
        const msgs = chatMessages.get(ctx.chat.id) || [];
        msgs.push(ctx.message.text);
        chatMessages.set(ctx.chat.id, msgs);
        await ctx.reply("Received");
      });

      const user = testBot.createUser({ first_name: "User" });
      const chats = Array.from({ length: 3 }, (_, i) =>
        testBot.createChat({ type: "private", id: 100 + i }),
      );

      // Send to all chats concurrently
      await Promise.all(
        chats.map((chat, i) => testBot.sendMessage(user, chat, `Chat ${i} message`)),
      );

      expect(chatMessages.size).toBe(3);
      chats.forEach((chat, i) => {
        expect(chatMessages.get(chat.id)).toContain(`Chat ${i} message`);
      });
    });

    it("should maintain message order within same chat", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      testBot.on("message:text", (ctx) => ctx.reply(`Echo: ${ctx.message.text}`));

      // Send messages sequentially to test ordering
      for (let i = 0; i < 5; i++) {
        await testBot.sendMessage(user, chat, `Msg ${i}`);
      }

      const botMessages = testBot.server.getBotMessages(chat.id);
      const texts = botMessages.map((m) => (m as { text?: string }).text);

      expect(texts).toEqual([
        "Echo: Msg 0",
        "Echo: Msg 1",
        "Echo: Msg 2",
        "Echo: Msg 3",
        "Echo: Msg 4",
      ]);
    });
  });

  describe("Concurrent Poll Voting", () => {
    it("should handle multiple users voting concurrently", async () => {
      const user = testBot.createUser({ first_name: "Creator" });
      const chat = testBot.createChat({ type: "group", title: "Test" });

      testBot.command("poll", (ctx) =>
        ctx.replyWithPoll("Favorite?", ["Apple", "Banana", "Cherry"]),
      );

      const pollResponse = await testBot.sendCommand(user, chat, "/poll");
      const poll = pollResponse.poll;
      expect(poll).toBeDefined();

      const voters = Array.from({ length: 10 }, (_, i) =>
        testBot.createUser({ first_name: `Voter${i}` }),
      );

      // All voters vote concurrently
      await Promise.all(
        voters.map((voter, i) => {
          const optionIndex = i % 3; // Distribute votes across options
          return testBot.vote(voter, poll, [optionIndex]);
        }),
      );

      const storedPoll = testBot.server.pollState.getPoll(poll.id);
      expect(storedPoll?.total_voter_count).toBe(10);

      // Verify vote distribution
      const totalVotes = storedPoll?.options.reduce((sum, opt) => sum + opt.voter_count, 0) ?? 0;
      expect(totalVotes).toBe(10);
    });

    it("should handle vote changes", async () => {
      const user = testBot.createUser({ first_name: "Creator" });
      const voter = testBot.createUser({ first_name: "Voter" });
      const chat = testBot.createChat({ type: "group", title: "Test" });

      testBot.command("poll", (ctx) => ctx.replyWithPoll("Pick one:", ["A", "B"]));

      const pollResponse = await testBot.sendCommand(user, chat, "/poll");
      const poll = pollResponse.poll;
      expect(poll).toBeDefined();

      // Vote for first option
      await testBot.vote(voter, poll, [0]);

      // Change vote to second option
      await testBot.vote(voter, poll, [1]);

      const storedPoll = testBot.server.pollState.getPoll(poll.id);

      // Should have only one vote total (changed, not added)
      expect(storedPoll?.total_voter_count).toBe(1);
      expect(storedPoll?.options[0].voter_count).toBe(0);
      expect(storedPoll?.options[1].voter_count).toBe(1);
    });
  });

  describe("Concurrent Reactions", () => {
    it("should handle multiple users reacting", async () => {
      const reactionsReceived: string[] = [];

      testBot.on("message_reaction", (ctx) => {
        const user = ctx.messageReaction?.user;
        if (user) {
          reactionsReceived.push(user.first_name);
        }
      });

      const poster = testBot.createUser({ first_name: "Poster" });
      const chat = testBot.createChat({ type: "group", title: "Test" });

      testBot.command("post", (ctx) => ctx.reply("React to me!"));

      const postResponse = await testBot.sendCommand(poster, chat, "/post");
      const message = postResponse.messages[0];

      const reactors = Array.from({ length: 5 }, (_, i) =>
        testBot.createUser({ first_name: `Reactor${i}` }),
      );

      // All react sequentially (concurrent reactions may mix up responses)
      for (const reactor of reactors) {
        await testBot.react(reactor, message, [{ type: "emoji", emoji: "👍" }]);
      }

      // All reactions should be recorded
      expect(reactionsReceived).toHaveLength(5);
    });

    it("should handle reaction changes", async () => {
      const poster = testBot.createUser({ first_name: "Poster" });
      const reactor = testBot.createUser({ first_name: "Reactor" });
      const chat = testBot.createChat({ type: "group", title: "Test" });

      testBot.command("post", (ctx) => ctx.reply("React!"));

      const postResponse = await testBot.sendCommand(poster, chat, "/post");
      const message = postResponse.messages[0];

      // React with thumbs up
      await testBot.react(reactor, message, [{ type: "emoji", emoji: "👍" }]);

      // Change to heart
      await testBot.react(reactor, message, [{ type: "emoji", emoji: "❤️" }]);

      // Change to laughing
      await testBot.react(reactor, message, [{ type: "emoji", emoji: "😂" }]);

      // Should work without errors
    });
  });

  describe("Concurrent Admin Operations", () => {
    it("should handle concurrent member restrictions", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });

      testBot.setOwner(group, admin);
      testBot.setBotAdmin(group, { can_restrict_members: true });

      const targets = Array.from({ length: 5 }, (_, i) => {
        const user = testBot.createUser({ first_name: `Target${i}` });
        testBot.setMember(group, user);
        return user;
      });

      testBot.command("muteall", async (ctx) => {
        // Mute all targets concurrently
        await Promise.all(
          targets.map((target) =>
            ctx.restrictChatMember(target.id, {
              permissions: { can_send_messages: false },
            }),
          ),
        );
        await ctx.reply("All muted");
      });

      const response = await testBot.sendCommand(admin, group, "/muteall");
      expect(response.text).toBe("All muted");

      // Verify all are restricted
      targets.forEach((target) => {
        const member = testBot.server.memberState.getMember(group.id, target.id);
        expect(member?.status).toBe("restricted");
      });
    });

    it("should handle concurrent role changes", async () => {
      const owner = testBot.createUser({ first_name: "Owner" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });

      testBot.setOwner(group, owner);

      const users = Array.from({ length: 3 }, (_, i) => {
        const user = testBot.createUser({ first_name: `User${i}` });
        testBot.setMember(group, user);
        return user;
      });

      // Promote all concurrently
      await Promise.all(
        users.map((user) =>
          testBot.server.memberState.setAdmin(group.id, user, {
            can_delete_messages: true,
          }),
        ),
      );

      // All should be admins
      users.forEach((user) => {
        const member = testBot.server.memberState.getMember(group.id, user.id);
        expect(member?.status).toBe("administrator");
      });
    });
  });

  describe("Concurrent Inline Queries", () => {
    it("should handle multiple inline queries from different users", async () => {
      const queriesReceived: string[] = [];

      testBot.on("inline_query", async (ctx) => {
        queriesReceived.push(`${ctx.from.first_name}: ${ctx.inlineQuery.query}`);
        await ctx.answerInlineQuery([
          {
            type: "article",
            id: "1",
            title: `Result for ${ctx.from.first_name}`,
            input_message_content: { message_text: ctx.inlineQuery.query },
          },
        ]);
      });

      const users = Array.from({ length: 5 }, (_, i) =>
        testBot.createUser({ first_name: `User${i}` }),
      );

      // Send queries sequentially to ensure proper tracking
      for (let i = 0; i < users.length; i++) {
        const response = await testBot.sendInlineQuery(users[i], `query${i}`);
        expect(response.inlineResults).toBeDefined();
        expect(response.inlineResults?.[0].title).toBe(`Result for User${i}`);
      }

      expect(queriesReceived).toHaveLength(5);
    });
  });

  describe("Concurrent Payment Operations", () => {
    it("should handle concurrent pre-checkout queries", async () => {
      const processedCheckouts: string[] = [];

      testBot.on("pre_checkout_query", async (ctx) => {
        processedCheckouts.push(ctx.preCheckoutQuery.id);
        await ctx.answerPreCheckoutQuery(true);
      });

      const users = Array.from({ length: 3 }, (_, i) =>
        testBot.createUser({ first_name: `Buyer${i}` }),
      );

      // All send pre-checkout concurrently
      await Promise.all(
        users.map((user, i) =>
          testBot.simulatePreCheckout(user, {
            id: `checkout_${i}`,
            currency: "USD",
            total_amount: 1000,
            invoice_payload: "item",
          }),
        ),
      );

      expect(processedCheckouts).toHaveLength(3);
    });
  });

  describe("Concurrent Conversation Interactions", () => {
    it("should handle concurrent conversation entries", async () => {
      // This tests that multiple users can be in separate conversation states
      const userStates = new Map<number, string>();

      testBot.on("message:text", (ctx) => {
        const currentState = userStates.get(ctx.from.id) || "idle";

        if (ctx.message.text === "/start") {
          userStates.set(ctx.from.id, "started");
          return ctx.reply("Started! Send your name.");
        }

        if (currentState === "started") {
          userStates.set(ctx.from.id, "named");
          return ctx.reply(`Hello, ${ctx.message.text}!`);
        }

        return ctx.reply("Send /start to begin");
      });

      const user1 = testBot.createUser({ first_name: "User1" });
      const user2 = testBot.createUser({ first_name: "User2" });
      const chat1 = testBot.createChat({ type: "private", id: 1 });
      const chat2 = testBot.createChat({ type: "private", id: 2 });

      // User1 starts
      await testBot.sendCommand(user1, chat1, "/start");

      // User2 starts
      await testBot.sendCommand(user2, chat2, "/start");

      // User1 provides name
      const response1 = await testBot.sendMessage(user1, chat1, "Alice");

      // User2 provides name
      const response2 = await testBot.sendMessage(user2, chat2, "Bob");

      expect(response1.text).toBe("Hello, Alice!");
      expect(response2.text).toBe("Hello, Bob!");

      // Both users reached named state
      expect(userStates.get(user1.id)).toBe("named");
      expect(userStates.get(user2.id)).toBe("named");
    });
  });

  describe("Concurrent File Uploads", () => {
    it("should handle photo uploads from different users", async () => {
      const photosReceived: string[] = [];

      testBot.on("message:photo", (ctx) => {
        photosReceived.push(ctx.from.first_name);
        return ctx.reply(`Got photo from ${ctx.from.first_name}`);
      });

      const users = Array.from({ length: 5 }, (_, i) =>
        testBot.createUser({ first_name: `User${i}` }),
      );

      const chat = testBot.createChat({ type: "group", title: "Test" });
      for (const u of users) {
        testBot.setMember(chat, u);
      }

      // Upload photos sequentially
      for (const user of users) {
        const response = await testBot.sendPhoto(user, chat, { width: 100, height: 100 });
        expect(response.text).toBe(`Got photo from ${user.first_name}`);
      }

      expect(photosReceived).toHaveLength(5);
    });
  });

  describe("Concurrent State Modifications", () => {
    it("should handle concurrent invite link creations", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const group = testBot.createChat({ type: "supergroup", title: "Test" });

      testBot.setOwner(group, admin);

      // Create multiple links concurrently
      const links = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          testBot.server.chatState.createInviteLink(group.id, admin, { name: `Link${i}` }),
        ),
      );

      // All links should be unique
      const linkUrls = links.map((l) => l?.invite_link);
      const uniqueUrls = new Set(linkUrls);
      expect(uniqueUrls.size).toBe(5);

      // All links should be stored
      const storedLinks = testBot.server.chatState.getInviteLinks(group.id);
      expect(storedLinks.length).toBeGreaterThanOrEqual(5);
    });

    it("should handle concurrent forum topic creations", async () => {
      const admin = testBot.createUser({ first_name: "Admin" });
      const forum = testBot.createChat({ type: "supergroup", title: "Forum", is_forum: true });

      testBot.setOwner(forum, admin);

      // Create multiple topics concurrently
      const topics = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          testBot.server.chatState.createForumTopic(forum.id, `Topic ${i}`),
        ),
      );

      // All topics should be created with unique IDs
      const topicIds = topics.map((t) => t?.message_thread_id);
      const uniqueIds = new Set(topicIds);
      expect(uniqueIds.size).toBe(5);
    });
  });

  describe("Mixed Operations", () => {
    it("should handle mixed operations in same chat", async () => {
      const results: string[] = [];

      testBot.command("cmd", (ctx) => {
        results.push("command");
        return ctx.reply("Command received");
      });

      testBot.on("message:text", (ctx) => {
        if (!ctx.message.text.startsWith("/")) {
          results.push("text");
          return ctx.reply("Text received");
        }
      });

      testBot.callbackQuery("btn", (ctx) => {
        results.push("callback");
        return ctx.answerCallbackQuery("Button clicked");
      });

      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      // First send a message with button
      testBot.command("menu", (ctx) =>
        ctx.reply("Menu", {
          reply_markup: {
            inline_keyboard: [[{ text: "Click", callback_data: "btn" }]],
          },
        }),
      );

      const menuResponse = await testBot.sendCommand(user, chat, "/menu");

      // Now do operations sequentially
      await testBot.sendCommand(user, chat, "/cmd");
      await testBot.sendMessage(user, chat, "Hello");
      await testBot.clickButton(user, chat, "btn", menuResponse.messages[0]);

      expect(results).toContain("command");
      expect(results).toContain("text");
      expect(results).toContain("callback");
      expect(results).toHaveLength(3);
    });
  });

  describe("Response Isolation (Race Condition Safety)", () => {
    it("should isolate responses when processing concurrent requests", async () => {
      // Bot that echoes messages with a unique response
      testBot.on("message:text", async (ctx) => {
        const userId = ctx.from.id;
        await ctx.reply(`Echo for user ${userId}: ${ctx.message.text}`);
      });

      const users = Array.from({ length: 10 }, (_, i) =>
        testBot.createUser({ id: 1000 + i, first_name: `User${i}` }),
      );
      const chat = testBot.createChat({ type: "group", title: "Test" });

      for (const user of users) {
        testBot.setMember(chat, user);
      }

      // Send all messages concurrently
      const responses = await Promise.all(
        users.map((user, i) => testBot.sendMessage(user, chat, `Message ${i}`)),
      );

      // Each response should contain exactly one message with the correct content
      for (let i = 0; i < responses.length; i++) {
        const response = responses[i];
        const user = users[i];

        expect(response.messages).toHaveLength(1);
        expect(response.text).toBe(`Echo for user ${user.id}: Message ${i}`);
      }
    });

    it("should isolate callback responses when clicking buttons concurrently", async () => {
      testBot.command("action", (ctx) =>
        ctx.reply("Choose:", {
          reply_markup: {
            inline_keyboard: [[{ text: "Click", callback_data: "action" }]],
          },
        }),
      );

      testBot.callbackQuery("action", async (ctx) => {
        await ctx.answerCallbackQuery(`Clicked by ${ctx.from.first_name}`);
      });

      const users = Array.from({ length: 5 }, (_, i) =>
        testBot.createUser({ id: 2000 + i, first_name: `Clicker${i}` }),
      );
      const chat = testBot.createChat({ type: "group", title: "Test" });

      for (const user of users) {
        testBot.setMember(chat, user);
      }

      // Create separate action messages for each user to avoid message edit conflicts
      const messages = await Promise.all(
        users.map((user) => testBot.sendCommand(user, chat, "/action")),
      );

      // All users click their own buttons concurrently
      const responses = await Promise.all(
        users.map((user, i) => testBot.clickButton(user, chat, "action", messages[i].messages[0])),
      );

      // Each response should have the correct callback answer for that user
      for (let i = 0; i < responses.length; i++) {
        const response = responses[i];
        const user = users[i];

        expect(response.callbackAnswer?.text).toBe(`Clicked by ${user.first_name}`);
      }
    });

    it("should isolate inline query responses concurrently", async () => {
      testBot.on("inline_query", (ctx) => {
        return ctx.answerInlineQuery([
          {
            type: "article",
            id: `result_${ctx.from.id}`,
            title: `Result for ${ctx.from.first_name}`,
            input_message_content: { message_text: ctx.inlineQuery.query },
          },
        ]);
      });

      const users = Array.from({ length: 5 }, (_, i) =>
        testBot.createUser({ id: 3000 + i, first_name: `Searcher${i}` }),
      );

      // All send inline queries concurrently
      const responses = await Promise.all(
        users.map((user, i) => testBot.sendInlineQuery(user, `Query ${i}`)),
      );

      // Each response should have the correct inline results for that user
      for (let i = 0; i < responses.length; i++) {
        const response = responses[i];
        const user = users[i];

        expect(response.inlineResults).toHaveLength(1);
        expect(response.inlineResults?.[0].id).toBe(`result_${user.id}`);
      }
    });

    it("should track API calls per-response in concurrent requests", async () => {
      testBot.on("message:text", async (ctx) => {
        // Each handler makes multiple API calls
        await ctx.reply(`Echo: ${ctx.message.text}`);
        await ctx.reply(`From: ${ctx.from.first_name}`);
      });

      const users = Array.from({ length: 5 }, (_, i) =>
        testBot.createUser({ id: 4000 + i, first_name: `ApiTracker${i}` }),
      );
      const chat = testBot.createChat({ type: "group", title: "API Test" });

      for (const user of users) {
        testBot.setMember(chat, user);
      }

      // Send messages concurrently
      const responses = await Promise.all(
        users.map((user, i) => testBot.sendMessage(user, chat, `Message ${i}`)),
      );

      // Each response should have exactly 2 sendMessage API calls
      for (let i = 0; i < responses.length; i++) {
        const response = responses[i];
        const user = users[i];

        // Check per-response API calls
        const sendMessageCalls = response.getApiCallsByMethod("sendMessage");
        expect(sendMessageCalls).toHaveLength(2);

        // Verify the calls are for the correct user's request
        expect(sendMessageCalls[0].payload.text).toBe(`Echo: Message ${i}`);
        expect(sendMessageCalls[1].payload.text).toBe(`From: ${user.first_name}`);
      }

      // Global API calls should have all 10 calls (5 users * 2 calls each)
      const allCalls = testBot.getApiCalls().filter((c) => c.method === "sendMessage");
      expect(allCalls).toHaveLength(10);
    });
  });
});
