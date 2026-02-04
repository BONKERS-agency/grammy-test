import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestBot } from "../src/index.js";

describe("Message Edits", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("User Editing Messages", () => {
    it("should handle user editing their text message", async () => {
      // Setup handler for edited messages
      testBot.on("edited_message:text", (ctx) => {
        ctx.reply(`You edited your message to: ${ctx.editedMessage?.text}`);
      });

      const user = testBot.createUser({ first_name: "Alice" });
      const chat = testBot.createChat({ type: "private" });

      // User edits their message
      const response = await testBot.editUserMessage(user, chat, 1, "Updated message");

      expect(response.text).toBe("You edited your message to: Updated message");
    });

    it("should receive edit_date in edited message", async () => {
      let receivedEditDate: number | undefined;

      testBot.on("edited_message:text", (ctx) => {
        receivedEditDate = ctx.editedMessage?.edit_date;
        ctx.reply("Edit received");
      });

      const user = testBot.createUser({ first_name: "Bob" });
      const chat = testBot.createChat({ type: "private" });

      await testBot.editUserMessage(user, chat, 1, "Edited text");

      expect(receivedEditDate).toBeDefined();
      expect(receivedEditDate).toBeGreaterThan(0);
    });

    it("should handle user editing message with formatting", async () => {
      let receivedEntities: unknown;

      testBot.on("edited_message:text", (ctx) => {
        receivedEntities = ctx.editedMessage?.entities;
        ctx.reply("Formatted edit received");
      });

      const user = testBot.createUser({ first_name: "Charlie" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.editUserMessage(user, chat, 1, "*bold* and _italic_", {
        parseMode: "Markdown",
      });

      expect(response.text).toBe("Formatted edit received");
      expect(receivedEntities).toBeDefined();
      expect(Array.isArray(receivedEntities)).toBe(true);
    });

    it("should not trigger message handler for edits", async () => {
      let messageHandlerCalled = false;
      let editHandlerCalled = false;

      testBot.on("message:text", () => {
        messageHandlerCalled = true;
      });

      testBot.on("edited_message:text", () => {
        editHandlerCalled = true;
      });

      const user = testBot.createUser({ first_name: "Dave" });
      const chat = testBot.createChat({ type: "private" });

      await testBot.editUserMessage(user, chat, 1, "Edited");

      expect(messageHandlerCalled).toBe(false);
      expect(editHandlerCalled).toBe(true);
    });

    it("should receive original message ID in edit", async () => {
      let receivedMessageId: number | undefined;

      testBot.on("edited_message:text", (ctx) => {
        receivedMessageId = ctx.editedMessage?.message_id;
        ctx.reply(`Edited message ID: ${receivedMessageId}`);
      });

      const user = testBot.createUser({ first_name: "Eve" });
      const chat = testBot.createChat({ type: "private" });
      const originalMessageId = 42;

      await testBot.editUserMessage(user, chat, originalMessageId, "New content");

      expect(receivedMessageId).toBe(originalMessageId);
    });
  });

  describe("Bot Editing Messages", () => {
    it("should edit bot's own message via command", async () => {
      // Store the message ID for later editing
      let sentMessageId: number | undefined;

      testBot.command("post", async (ctx) => {
        const sent = await ctx.reply("Initial message");
        sentMessageId = sent.message_id;
      });

      testBot.command("edit", async (ctx) => {
        if (sentMessageId && ctx.chat) {
          await ctx.api.editMessageText(ctx.chat.id, sentMessageId, "Edited by command!");
        }
      });

      const user = testBot.createUser({ first_name: "Frank" });
      const chat = testBot.createChat({ type: "private" });

      // First, post the message
      const postResponse = await testBot.sendCommand(user, chat, "/post");
      expect(postResponse.text).toBe("Initial message");
      sentMessageId = postResponse.messages[0]?.message_id;

      // Then, edit it
      const editResponse = await testBot.sendCommand(user, chat, "/edit");
      expect(editResponse.editedText).toBe("Edited by command!");
    });

    it("should edit message with new formatting", async () => {
      let sentMessageId: number | undefined;

      testBot.command("post", async (ctx) => {
        const sent = await ctx.reply("Plain text");
        sentMessageId = sent.message_id;
      });

      testBot.command("format", async (ctx) => {
        if (sentMessageId && ctx.chat) {
          await ctx.api.editMessageText(ctx.chat.id, sentMessageId, "*Now bold* and _italic_", {
            parse_mode: "Markdown",
          });
        }
      });

      const user = testBot.createUser({ first_name: "Grace" });
      const chat = testBot.createChat({ type: "private" });

      await testBot.sendCommand(user, chat, "/post");
      const editResponse = await testBot.sendCommand(user, chat, "/format");

      expect(editResponse.editedText).toBe("Now bold and italic");
      expect(editResponse.editedMessages[0]).toBeDefined();
    });

    it("should edit message on callback query", async () => {
      testBot.command("menu", async (ctx) => {
        await ctx.reply("Choose an option:", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Option A", callback_data: "opt_a" }],
              [{ text: "Option B", callback_data: "opt_b" }],
            ],
          },
        });
      });

      testBot.callbackQuery("opt_a", async (ctx) => {
        await ctx.answerCallbackQuery("Selected A");
        await ctx.editMessageText("You chose Option A!");
      });

      testBot.callbackQuery("opt_b", async (ctx) => {
        await ctx.answerCallbackQuery("Selected B");
        await ctx.editMessageText("You chose Option B!");
      });

      const user = testBot.createUser({ first_name: "Harry" });
      const chat = testBot.createChat({ type: "private" });

      // Show menu
      const menuResponse = await testBot.sendCommand(user, chat, "/menu");
      expect(menuResponse.text).toBe("Choose an option:");
      expect(menuResponse.keyboard?.inline).toBeDefined();

      // Click option A
      const clickResponse = await testBot.clickButton(
        user,
        chat,
        "opt_a",
        menuResponse.messages[0],
      );
      expect(clickResponse.callbackAnswer?.text).toBe("Selected A");
      expect(clickResponse.editedText).toBe("You chose Option A!");
    });

    it("should edit message and update keyboard", async () => {
      testBot.command("start", async (ctx) => {
        await ctx.reply("Welcome!", {
          reply_markup: {
            inline_keyboard: [[{ text: "Continue", callback_data: "continue" }]],
          },
        });
      });

      testBot.callbackQuery("continue", async (ctx) => {
        await ctx.answerCallbackQuery();
        await ctx.editMessageText("Step 2", {
          reply_markup: {
            inline_keyboard: [[{ text: "Finish", callback_data: "finish" }]],
          },
        });
      });

      testBot.callbackQuery("finish", async (ctx) => {
        await ctx.answerCallbackQuery("Done!");
        await ctx.editMessageText("Completed!");
      });

      const user = testBot.createUser({ first_name: "Ivy" });
      const chat = testBot.createChat({ type: "private" });

      // Start
      const startResponse = await testBot.sendCommand(user, chat, "/start");
      expect(startResponse.text).toBe("Welcome!");

      // Continue
      const continueResponse = await testBot.clickButton(
        user,
        chat,
        "continue",
        startResponse.messages[0],
      );
      expect(continueResponse.editedText).toBe("Step 2");

      // Finish
      const finishResponse = await testBot.clickButton(
        user,
        chat,
        "finish",
        continueResponse.editedMessages[0],
      );
      expect(finishResponse.editedText).toBe("Completed!");
    });

    it("should edit only reply markup", async () => {
      testBot.command("buttons", async (ctx) => {
        await ctx.reply("Choose:", {
          reply_markup: {
            inline_keyboard: [[{ text: "Click me", callback_data: "click" }]],
          },
        });
      });

      testBot.callbackQuery("click", async (ctx) => {
        await ctx.answerCallbackQuery("Clicked!");
        await ctx.editMessageReplyMarkup({
          reply_markup: {
            inline_keyboard: [[{ text: "Clicked!", callback_data: "clicked" }]],
          },
        });
      });

      const user = testBot.createUser({ first_name: "Jack" });
      const chat = testBot.createChat({ type: "private" });

      const buttonsResponse = await testBot.sendCommand(user, chat, "/buttons");
      expect(buttonsResponse.keyboard?.inline?.[0]?.[0]?.text).toBe("Click me");

      const clickResponse = await testBot.clickButton(
        user,
        chat,
        "click",
        buttonsResponse.messages[0],
      );

      // Message text should remain unchanged, only markup updated
      expect(clickResponse.editedMessages[0]?.reply_markup?.inline_keyboard?.[0]?.[0]?.text).toBe(
        "Clicked!",
      );
    });
  });

  describe("Bot Editing Messages via Worker", () => {
    it("should edit message from worker after async processing", async () => {
      const _user = testBot.createUser({ first_name: "Kate" });
      const chat = testBot.createChat({ type: "private" });
      const worker = testBot.createWorkerSimulator();

      // First send a "processing" message
      const initialResponse = await worker.sendMessage(chat.id, "Processing...");
      const messageId = initialResponse.messages[0]?.message_id ?? 1;

      // Worker edits the message after processing
      const editResponse = await worker.editMessage(chat.id, messageId, "Processing complete!");

      expect(editResponse.editedText).toBe("Processing complete!");
    });

    it("should handle progress updates via edits", async () => {
      const _user = testBot.createUser({ first_name: "Leo" });
      const chat = testBot.createChat({ type: "private" });
      const worker = testBot.createWorkerSimulator();

      // Send initial progress
      const initialResponse = await worker.sendMessage(chat.id, "Progress: 0%");
      const messageId = initialResponse.messages[0]?.message_id ?? 1;

      // Simulate progress updates
      await worker.editMessage(chat.id, messageId, "Progress: 25%");
      await worker.editMessage(chat.id, messageId, "Progress: 50%");
      await worker.editMessage(chat.id, messageId, "Progress: 75%");
      const finalResponse = await worker.editMessage(chat.id, messageId, "Progress: 100% - Done!");

      expect(finalResponse.editedText).toBe("Progress: 100% - Done!");
    });
  });

  describe("Edge Cases", () => {
    it("should handle edit when no handler is registered", async () => {
      // No edited_message handler registered
      const user = testBot.createUser({ first_name: "Mike" });
      const chat = testBot.createChat({ type: "private" });

      // Should not throw
      const response = await testBot.editUserMessage(user, chat, 1, "Edited");

      // Response should be empty since no handler responded
      expect(response.text).toBeUndefined();
    });

    it("should handle edit to same message multiple times", async () => {
      const edits: string[] = [];

      testBot.on("edited_message:text", (ctx) => {
        edits.push(ctx.editedMessage?.text ?? "");
      });

      const user = testBot.createUser({ first_name: "Nancy" });
      const chat = testBot.createChat({ type: "private" });
      const messageId = 1;

      await testBot.editUserMessage(user, chat, messageId, "Edit 1");
      await testBot.editUserMessage(user, chat, messageId, "Edit 2");
      await testBot.editUserMessage(user, chat, messageId, "Edit 3");

      expect(edits).toEqual(["Edit 1", "Edit 2", "Edit 3"]);
    });

    it("should handle reply to edited message", async () => {
      testBot.on("edited_message:text", async (ctx) => {
        await ctx.reply(`I saw you edit message ${ctx.editedMessage?.message_id}`);
      });

      const user = testBot.createUser({ first_name: "Oscar" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.editUserMessage(user, chat, 123, "Edited content");

      expect(response.text).toBe("I saw you edit message 123");
    });

    it("should handle bot trying to edit non-existent message", async () => {
      testBot.command("edit_fake", async (ctx) => {
        try {
          if (ctx.chat) {
            await ctx.api.editMessageText(ctx.chat.id, 99999, "This won't work");
          }
        } catch (_error) {
          await ctx.reply("Failed to edit: message not found");
        }
      });

      const user = testBot.createUser({ first_name: "Paul" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/edit_fake");

      // The exact behavior depends on TelegramServer implementation
      // Either it throws an error that we catch, or it succeeds silently
      expect(response.messages.length).toBeGreaterThan(0);
    });
  });

  describe("Complex Edit Scenarios", () => {
    it("should handle conversation with message editing", async () => {
      let _currentMessageId: number | undefined;

      testBot.command("start_order", async (ctx) => {
        const msg = await ctx.reply("What would you like to order?");
        _currentMessageId = msg.message_id;
      });

      // User edits their order while in conversation
      testBot.on("edited_message:text", async (ctx) => {
        await ctx.reply(`Order updated to: ${ctx.editedMessage?.text}`);
      });

      testBot.on("message:text", async (ctx) => {
        if (ctx.message.text && !ctx.message.text.startsWith("/")) {
          await ctx.reply(`Order received: ${ctx.message.text}`);
        }
      });

      const user = testBot.createUser({ first_name: "Quinn" });
      const chat = testBot.createChat({ type: "private" });

      // Start order
      const startResponse = await testBot.sendCommand(user, chat, "/start_order");
      expect(startResponse.text).toBe("What would you like to order?");

      // User sends order
      const orderResponse = await testBot.sendMessage(user, chat, "Pizza");
      expect(orderResponse.text).toBe("Order received: Pizza");

      // User edits their order
      const editResponse = await testBot.editUserMessage(
        user,
        chat,
        orderResponse.messages[0]?.message_id ?? 2,
        "Pizza with extra cheese",
      );
      expect(editResponse.text).toBe("Order updated to: Pizza with extra cheese");
    });

    it("should track both sent and edited messages in response", async () => {
      testBot.command("multi", async (ctx) => {
        const msg = await ctx.reply("Initial");
        if (ctx.chat) {
          await ctx.api.editMessageText(ctx.chat.id, msg.message_id, "Edited immediately");
        }
        await ctx.reply("Follow up");
      });

      const user = testBot.createUser({ first_name: "Rachel" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/multi");

      expect(response.messages).toHaveLength(2);
      expect(response.editedMessages).toHaveLength(1);
      expect(response.texts).toContain("Follow up");
      expect(response.editedText).toBe("Edited immediately");
    });

    it("should handle inline keyboard navigation with edits", async () => {
      testBot.command("wizard", async (ctx) => {
        await ctx.reply("Step 1: Choose category", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Electronics", callback_data: "cat_electronics" }],
              [{ text: "Clothing", callback_data: "cat_clothing" }],
            ],
          },
        });
      });

      testBot.callbackQuery(/^cat_/, async (ctx) => {
        const category = (ctx.callbackQuery.data ?? "").replace("cat_", "");
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(`Step 2: Selected ${category}. Choose subcategory:`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Option 1", callback_data: `sub_${category}_1` }],
              [{ text: "Option 2", callback_data: `sub_${category}_2` }],
              [{ text: "Back", callback_data: "back" }],
            ],
          },
        });
      });

      testBot.callbackQuery("back", async (ctx) => {
        await ctx.answerCallbackQuery();
        await ctx.editMessageText("Step 1: Choose category", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Electronics", callback_data: "cat_electronics" }],
              [{ text: "Clothing", callback_data: "cat_clothing" }],
            ],
          },
        });
      });

      const user = testBot.createUser({ first_name: "Sam" });
      const chat = testBot.createChat({ type: "private" });

      // Start wizard
      const step1 = await testBot.sendCommand(user, chat, "/wizard");
      expect(step1.text).toBe("Step 1: Choose category");

      // Select electronics
      const step2 = await testBot.clickButton(user, chat, "cat_electronics", step1.messages[0]);
      expect(step2.editedText).toBe("Step 2: Selected electronics. Choose subcategory:");

      // Go back
      const backToStep1 = await testBot.clickButton(user, chat, "back", step2.editedMessages[0]);
      expect(backToStep1.editedText).toBe("Step 1: Choose category");
    });
  });
});
