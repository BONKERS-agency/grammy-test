import {
  type Conversation,
  type ConversationFlavor,
  conversations,
  createConversation,
} from "@grammyjs/conversations";
import { type Context, type SessionFlavor, session } from "grammy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createConversationTester, TestBot } from "../src/index.js";

// Define session and context types
type SessionData = Record<string, never>;

type MyContext = Context & SessionFlavor<SessionData> & ConversationFlavor;
type MyConversation = Conversation<MyContext>;

describe("Conversations Plugin", () => {
  let testBot: TestBot<MyContext>;

  beforeEach(() => {
    testBot = new TestBot<MyContext>();

    // Set up session (required for conversations)
    testBot.use(
      session({
        initial: (): SessionData => ({}),
      }),
    );

    // Set up conversations plugin
    testBot.use(conversations());
  });

  afterEach(() => {
    // Clean up fetch interceptor
    testBot.dispose();
  });

  describe("basic conversation flow", () => {
    it("should handle a simple two-step conversation", async () => {
      // Define a greeting conversation
      async function greeting(conversation: MyConversation, ctx: MyContext) {
        await ctx.reply("What is your name?");
        const { message } = await conversation.waitFor("message:text");
        await ctx.reply(`Hello, ${message?.text ?? ""}! Nice to meet you.`);
      }

      // Register the conversation
      testBot.use(createConversation(greeting));

      // Command to enter the conversation
      testBot.command("greet", async (ctx) => {
        await ctx.conversation.enter("greeting");
      });

      const user = testBot.createUser({ first_name: "Alice" });
      const chat = testBot.createChat({ type: "private" });

      // Start the conversation
      const r1 = await testBot.sendCommand(user, chat, "/greet");
      expect(r1.text).toBe("What is your name?");

      // Respond with name
      const r2 = await testBot.sendMessage(user, chat, "Alice");
      expect(r2.text).toBe("Hello, Alice! Nice to meet you.");
    });

    it("should handle multi-step conversations", async () => {
      // Pizza ordering conversation
      async function orderPizza(conversation: MyConversation, ctx: MyContext) {
        await ctx.reply("What size pizza? (small/medium/large)");
        const sizeCtx = await conversation.waitFor("message:text");
        const size = sizeCtx.message?.text ?? "";

        await ctx.reply("What toppings would you like?");
        const toppingsCtx = await conversation.waitFor("message:text");
        const toppings = toppingsCtx.message?.text ?? "";

        await ctx.reply(`Order confirmed: ${size} pizza with ${toppings}!`);
      }

      testBot.use(createConversation(orderPizza));
      testBot.command("order", async (ctx) => {
        await ctx.conversation.enter("orderPizza");
      });

      const user = testBot.createUser();
      const chat = testBot.createChat({ type: "private" });

      // Use ConversationTester for cleaner syntax
      const convo = createConversationTester(testBot, user, chat);

      await convo.start("/order");
      expect(convo.getLastBotText()).toBe("What size pizza? (small/medium/large)");

      await convo.say("large");
      expect(convo.getLastBotText()).toBe("What toppings would you like?");

      await convo.say("pepperoni and mushrooms");
      expect(convo.getLastBotText()).toBe(
        "Order confirmed: large pizza with pepperoni and mushrooms!",
      );
    });
  });

  describe("conversation with validation", () => {
    it("should handle conversation loops for validation", async () => {
      async function getAge(conversation: MyConversation, ctx: MyContext) {
        let age: number | null = null;

        while (age === null) {
          await ctx.reply("Please enter your age (must be 18+):");
          const response = await conversation.waitFor("message:text");
          const parsed = parseInt(response.message?.text ?? "", 10);

          if (Number.isNaN(parsed)) {
            await ctx.reply("That's not a valid number!");
          } else if (parsed < 18) {
            await ctx.reply("You must be 18 or older.");
          } else {
            age = parsed;
          }
        }

        await ctx.reply(`Age verified: ${age}`);
      }

      testBot.use(createConversation(getAge));
      testBot.command("verify", async (ctx) => {
        await ctx.conversation.enter("getAge");
      });

      const user = testBot.createUser();
      const chat = testBot.createChat({ type: "private" });
      const convo = createConversationTester(testBot, user, chat);

      await convo.start("/verify");
      expect(convo.getLastBotText()).toBe("Please enter your age (must be 18+):");

      // Invalid input - the loop sends error then prompts again
      await convo.say("abc");
      expect(convo.hasBotMessageContaining("not a valid number")).toBe(true);
      // Last message will be the next prompt due to loop structure
      expect(convo.getLastBotText()).toBe("Please enter your age (must be 18+):");

      // Too young - same pattern
      await convo.say("15");
      expect(convo.hasBotMessageContaining("must be 18 or older")).toBe(true);
      expect(convo.getLastBotText()).toBe("Please enter your age (must be 18+):");

      // Valid age - exits loop, sends final message
      await convo.say("25");
      expect(convo.getLastBotText()).toBe("Age verified: 25");
    });
  });

  describe("conversation cancellation", () => {
    it("should allow exiting a conversation", async () => {
      async function survey(conversation: MyConversation, ctx: MyContext) {
        await ctx.reply("Question 1: What's your favorite color?");
        const q1 = await conversation.waitFor("message:text");

        if (q1.message?.text === "/cancel") {
          await ctx.reply("Survey cancelled.");
          return;
        }

        await ctx.reply("Question 2: What's your favorite food?");
        const q2 = await conversation.waitFor("message:text");

        if (q2.message?.text === "/cancel") {
          await ctx.reply("Survey cancelled.");
          return;
        }

        await ctx.reply("Thanks for completing the survey!");
      }

      testBot.use(createConversation(survey));
      testBot.command("survey", async (ctx) => {
        await ctx.conversation.enter("survey");
      });

      const user = testBot.createUser();
      const chat = testBot.createChat({ type: "private" });
      const convo = createConversationTester(testBot, user, chat);

      await convo.start("/survey");
      expect(convo.getLastBotText()).toBe("Question 1: What's your favorite color?");

      await convo.say("blue");
      expect(convo.getLastBotText()).toBe("Question 2: What's your favorite food?");

      // Cancel mid-survey
      await convo.say("/cancel");
      expect(convo.getLastBotText()).toBe("Survey cancelled.");
    });
  });

  describe("ConversationTester helpers", () => {
    it("should track conversation steps", async () => {
      async function simple(conversation: MyConversation, ctx: MyContext) {
        await ctx.reply("Step 1");
        await conversation.waitFor("message:text");
        await ctx.reply("Step 2");
        await conversation.waitFor("message:text");
        await ctx.reply("Done");
      }

      testBot.use(createConversation(simple));
      testBot.command("start", async (ctx) => {
        await ctx.conversation.enter("simple");
      });

      const user = testBot.createUser();
      const chat = testBot.createChat({ type: "private" });
      const convo = createConversationTester(testBot, user, chat);

      await convo.start("/start");
      expect(convo.getStepCount()).toBe(1);

      await convo.say("next");
      expect(convo.getStepCount()).toBe(2);

      await convo.say("finish");
      expect(convo.getStepCount()).toBe(3);

      // Check all bot messages were sent
      expect(convo.hasBotMessage("Step 1")).toBe(true);
      expect(convo.hasBotMessage("Step 2")).toBe(true);
      expect(convo.hasBotMessage("Done")).toBe(true);
    });

    it("should support hasBotMessageContaining", async () => {
      async function dynamic(conversation: MyConversation, ctx: MyContext) {
        await ctx.reply("Enter a number:");
        const { message } = await conversation.waitFor("message:text");
        const num = parseInt(message?.text ?? "", 10);
        await ctx.reply(
          `You entered the number ${num}, which is ${num % 2 === 0 ? "even" : "odd"}.`,
        );
      }

      testBot.use(createConversation(dynamic));
      testBot.command("num", async (ctx) => {
        await ctx.conversation.enter("dynamic");
      });

      const user = testBot.createUser();
      const chat = testBot.createChat({ type: "private" });
      const convo = createConversationTester(testBot, user, chat);

      await convo.start("/num");
      await convo.say("42");

      expect(convo.hasBotMessageContaining("42")).toBe(true);
      expect(convo.hasBotMessageContaining("even")).toBe(true);
    });
  });
});
