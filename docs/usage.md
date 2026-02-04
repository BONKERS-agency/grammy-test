# Usage

## Installation

```bash
npm install grammy-test --save-dev
```

## Test Isolation

**IMPORTANT:** The framework intercepts `globalThis.fetch` to route Telegram API calls to the simulated server. This is necessary for plugins like `@grammyjs/conversations` that create new Api instances.

**Best practices:**

1. **Always call `dispose()`** in `afterEach` to restore the original fetch
2. **Run tests in a separate process** from production (standard practice anyway)
3. **Never import production bot code** that auto-starts (`bot.start()`) in test files

```typescript
// WRONG - auto-starts on import, would conflict with tests
import { bot } from "./bot";  // bot.start() called at module load

// CORRECT - import factory function, don't auto-start
import { createBot } from "./bot";  // Returns configured bot without starting
```

## Basic Example

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestBot } from "grammy-test";

describe("MyBot", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();

    // Add handlers directly to TestBot (it extends Bot)
    testBot.command("start", (ctx) => ctx.reply("Welcome!"));
    testBot.on("message:text", (ctx) => ctx.reply(`Echo: ${ctx.message.text}`));
  });

  // CRITICAL: Always dispose to restore global fetch
  afterEach(() => {
    testBot.dispose();
  });

  it("responds to /start", async () => {
    const user = testBot.createUser({ first_name: "Alice" });
    const chat = testBot.createChat({ type: "private" });

    const response = await testBot.sendCommand(user, chat, "/start");

    expect(response.text).toBe("Welcome!");
  });

  it("echoes messages", async () => {
    const user = testBot.createUser();
    const chat = testBot.createChat({ type: "private" });

    const response = await testBot.sendMessage(user, chat, "Hello bot!");

    expect(response.text).toBe("Echo: Hello bot!");
  });
});
```

## Testing an Existing Bot

There are several patterns for integrating grammy-test with your existing grammY bot, depending on how your bot is structured.

### Pattern 1: Handler Factory (Recommended)

The cleanest approach is to extract your handlers into a function that accepts any Bot instance:

```typescript
// src/handlers.ts - Extract handlers into reusable function
import { Bot, Context } from "grammy";

export function setupHandlers<C extends Context>(bot: Bot<C>) {
  bot.command("start", (ctx) => ctx.reply("Welcome!"));
  bot.command("help", (ctx) => ctx.reply("Available commands: /start, /help"));
  bot.on("message:text", (ctx) => ctx.reply(`Echo: ${ctx.message.text}`));
}

// src/index.ts - Production entry point
import { Bot } from "grammy";
import { setupHandlers } from "./handlers.js";

const bot = new Bot(process.env.BOT_TOKEN!);
setupHandlers(bot);
bot.start();

// test/bot.test.ts - Test file
import { TestBot } from "grammy-test";
import { setupHandlers } from "../src/handlers.js";

describe("MyBot", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
    setupHandlers(testBot);  // Works because TestBot extends Bot
  });

  it("responds to /start", async () => {
    const user = testBot.createUser({ first_name: "Alice" });
    const chat = testBot.createChat({ type: "private" });

    const response = await testBot.sendCommand(user, chat, "/start");
    expect(response.text).toBe("Welcome!");
  });
});
```

### Pattern 2: Bot Factory with Dependency Injection

If your bot needs configuration or dependencies, create a factory that accepts either config or an existing bot:

```typescript
// src/bot.ts
import { Bot, session } from "grammy";
import type { MyContext } from "./types.js";

export interface BotConfig {
  token: string;
  adminIds?: number[];
}

export function createBot(configOrBot: BotConfig | Bot<MyContext>): Bot<MyContext> {
  const isExistingBot = configOrBot instanceof Bot;
  const bot = isExistingBot ? configOrBot : new Bot<MyContext>(configOrBot.token);

  // Only add middleware when creating new bot
  // (tests set up their own middleware for proper isolation)
  if (!isExistingBot) {
    bot.use(session({ initial: () => ({ count: 0 }) }));
  }

  // Always add handlers
  bot.command("start", (ctx) => {
    ctx.session.count++;
    return ctx.reply(`Welcome! Visit #${ctx.session.count}`);
  });

  return bot;
}

// src/index.ts - Production
const bot = createBot({ token: process.env.BOT_TOKEN! });
bot.start();

// test/bot.test.ts
import { TestBot } from "grammy-test";
import { session } from "grammy";
import { createBot } from "../src/bot.js";

describe("MyBot", () => {
  let testBot: TestBot<MyContext>;

  beforeEach(() => {
    testBot = new TestBot<MyContext>();

    // Set up middleware BEFORE calling createBot
    testBot.use(session({ initial: () => ({ count: 0 }) }));

    // Apply handlers (middleware is skipped since we pass existing bot)
    createBot(testBot);
  });

  it("tracks visit count", async () => {
    const user = testBot.createUser();
    const chat = testBot.createChat({ type: "private" });

    await testBot.sendCommand(user, chat, "/start");
    const response = await testBot.sendCommand(user, chat, "/start");

    expect(response.text).toBe("Welcome! Visit #2");
  });
});
```

### Pattern 3: Testing a Monolithic Bot File

If your bot is in a single file without a factory, you can refactor minimally:

```typescript
// BEFORE: src/bot.ts (hard to test)
import { Bot } from "grammy";

const bot = new Bot(process.env.BOT_TOKEN!);
bot.command("start", (ctx) => ctx.reply("Hello!"));
bot.start();

// AFTER: src/bot.ts (testable)
import { Bot } from "grammy";

// Export bot creation for testing
export function createBot(token: string): Bot {
  const bot = new Bot(token);
  bot.command("start", (ctx) => ctx.reply("Hello!"));
  return bot;
}

// Only start if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  const bot = createBot(process.env.BOT_TOKEN!);
  bot.start();
}

// test/bot.test.ts
import { TestBot } from "grammy-test";

// Import just the handlers setup, not the whole bot
describe("MyBot", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
    // Recreate your handlers here, or refactor to export them
    testBot.command("start", (ctx) => ctx.reply("Hello!"));
  });

  it("responds to /start", async () => {
    const user = testBot.createUser();
    const chat = testBot.createChat({ type: "private" });

    const response = await testBot.sendCommand(user, chat, "/start");
    expect(response.text).toBe("Hello!");
  });
});
```

### Pattern 4: Testing with Conversations Plugin

When using `@grammyjs/conversations`, set up middleware in the correct order:

```typescript
// src/conversations.ts
import type { Conversation, ConversationFlavor } from "@grammyjs/conversations";
import type { Context } from "grammy";

export type MyContext = Context & ConversationFlavor;
export type MyConversation = Conversation<MyContext>;

export async function surveyConversation(
  conversation: MyConversation,
  ctx: MyContext
) {
  await ctx.reply("What's your name?");
  const nameCtx = await conversation.waitFor("message:text");
  const name = nameCtx.message.text;

  await ctx.reply("What's your favorite color?");
  const colorCtx = await conversation.waitFor("message:text");
  const color = colorCtx.message.text;

  await ctx.reply(`Nice to meet you, ${name}! I like ${color} too.`);
}

// src/bot.ts
import { Bot, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { surveyConversation, type MyContext } from "./conversations.js";

export function createBot(bot: Bot<MyContext>) {
  // Handlers only - no middleware (tests provide their own)
  bot.use(createConversation(surveyConversation));
  bot.command("survey", (ctx) => ctx.conversation.enter("surveyConversation"));
  bot.command("start", (ctx) => ctx.reply("Use /survey to take a survey"));
}

// src/index.ts - Production
const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);
bot.use(session({ initial: () => ({}) }));
bot.use(conversations());
createBot(bot);
bot.start();

// test/bot.test.ts
import { TestBot, createConversationTester } from "grammy-test";
import { session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { surveyConversation, type MyContext } from "../src/conversations.js";
import { createBot } from "../src/bot.js";

describe("Survey Bot", () => {
  let testBot: TestBot<MyContext>;

  beforeEach(() => {
    testBot = new TestBot<MyContext>();

    // IMPORTANT: Set up middleware in correct order BEFORE handlers
    testBot.use(session({ initial: () => ({}) }));
    testBot.use(conversations());
    testBot.use(createConversation(surveyConversation));

    // Now apply handlers
    createBot(testBot);
  });

  it("completes survey conversation", async () => {
    const user = testBot.createUser();
    const chat = testBot.createChat({ type: "private" });
    const convo = createConversationTester(testBot, user, chat);

    const r1 = await convo.start("/survey");
    expect(r1.text).toBe("What's your name?");

    const r2 = await convo.say("Alice");
    expect(r2.text).toBe("What's your favorite color?");

    const r3 = await convo.say("blue");
    expect(r3.text).toContain("Nice to meet you, Alice");
    expect(r3.text).toContain("blue");
  });
});
```

### Pattern 5: Composer-Based Architecture

If your bot uses Composers for modular organization:

```typescript
// src/commands/admin.ts
import { Composer } from "grammy";
import type { MyContext } from "../types.js";

export const adminComposer = new Composer<MyContext>();

adminComposer.command("ban", async (ctx) => {
  const member = await ctx.getChatMember(ctx.from!.id);
  if (member.status !== "creator" && member.status !== "administrator") {
    return ctx.reply("Admin only!");
  }
  // ... ban logic
  return ctx.reply("User banned.");
});

// src/commands/basic.ts
import { Composer } from "grammy";
import type { MyContext } from "../types.js";

export const basicComposer = new Composer<MyContext>();

basicComposer.command("start", (ctx) => ctx.reply("Welcome!"));
basicComposer.command("help", (ctx) => ctx.reply("Commands: /start, /help, /ban"));

// src/bot.ts
import { Bot } from "grammy";
import { adminComposer } from "./commands/admin.js";
import { basicComposer } from "./commands/basic.js";

export function setupBot(bot: Bot<MyContext>) {
  bot.use(basicComposer);
  bot.use(adminComposer);
}

// test/admin.test.ts
import { TestBot } from "grammy-test";
import { adminComposer } from "../src/commands/admin.js";

describe("Admin Commands", () => {
  let testBot: TestBot<MyContext>;

  beforeEach(() => {
    testBot = new TestBot<MyContext>();
    testBot.use(adminComposer);  // Test just the admin composer
  });

  it("rejects /ban from non-admin", async () => {
    const user = testBot.createUser();
    const group = testBot.createChat({ type: "supergroup", title: "Test" });
    testBot.setMember(group, user);

    const response = await testBot.sendCommand(user, group, "/ban");
    expect(response.text).toBe("Admin only!");
  });

  it("allows /ban from admin", async () => {
    const admin = testBot.createUser();
    const group = testBot.createChat({ type: "supergroup", title: "Test" });
    testBot.setOwner(group, admin);

    const response = await testBot.sendCommand(admin, group, "/ban");
    expect(response.text).toBe("User banned.");
  });
});
```

### Key Points for Testing Existing Bots

1. **Middleware Order Matters**: Always set up session, conversations, and other middleware BEFORE registering handlers.

2. **Separate Middleware from Handlers**: Let tests control middleware setup for better isolation. Your factory function should skip middleware when receiving an existing bot.

3. **Use Type Parameters**: Pass your custom context type to TestBot: `new TestBot<MyContext>()`.

4. **Test in Isolation**: Use Composers to test individual features without loading the entire bot.

5. **Don't Forget cleanup**: Call `testBot.dispose()` in `afterEach` to clean up resources.

## BotResponse Object

Every simulation method returns a `BotResponse` with rich assertion helpers:

```typescript
const response = await testBot.sendCommand(user, chat, "/menu");

// Access sent messages
response.text;           // Last message text
response.texts;          // All message texts
response.messages;       // Full Message objects

// Access keyboards
response.keyboard?.inline;  // InlineKeyboardButton[][]
response.keyboard?.reply;   // KeyboardButton[][]

// Access formatting
response.entities;          // MessageEntity[]
response.hasEntity("bold"); // Check for entity type

// Access callback answers
response.callbackAnswer?.text;
response.callbackAnswer?.showAlert;

// Access polls and invoices
response.poll;
response.invoice;

// Check for errors
response.error?.code;
response.error?.description;

// Helpers
response.hasText("Welcome");
response.hasTextContaining("Welcome");
```

## Testing Inline Keyboards

```typescript
testBot.command("menu", (ctx) => {
  return ctx.reply("Choose:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Option A", callback_data: "opt_a" }],
        [{ text: "Option B", callback_data: "opt_b" }],
      ],
    },
  });
});

testBot.callbackQuery("opt_a", (ctx) => {
  ctx.answerCallbackQuery("You chose A!");
  return ctx.editMessageText("Selected: Option A");
});

it("handles button clicks", async () => {
  const user = testBot.createUser();
  const chat = testBot.createChat({ type: "private" });

  const menuResponse = await testBot.sendCommand(user, chat, "/menu");
  expect(menuResponse.keyboard?.inline).toBeDefined();

  const response = await testBot.clickButton(user, chat, "opt_a", menuResponse.messages[0]);

  expect(response.callbackAnswer?.text).toBe("You chose A!");
  expect(response.editedText).toBe("Selected: Option A");
});
```

## Testing Admin Commands

The framework enforces bot permissions just like real Telegram. Use `setBotAdmin()` to grant the bot the required permissions before calling admin methods.

```typescript
testBot.command("ban", async (ctx) => {
  const member = await ctx.getChatMember(ctx.from!.id);
  // Note: "creator" (owner) is also an admin - they have all permissions
  if (member.status !== "administrator" && member.status !== "creator") {
    return ctx.reply("Admin only!");
  }
  const targetId = ctx.message?.reply_to_message?.from?.id;
  if (!targetId) return ctx.reply("Reply to a user to ban them.");
  await ctx.banChatMember(targetId);
  return ctx.reply("User banned.");
});

it("rejects /ban from non-admin", async () => {
  const member = testBot.createUser({ first_name: "Member" });
  const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

  testBot.setMember(group, member);  // Regular member, not admin

  const response = await testBot.sendCommand(member, group, "/ban");
  expect(response.text).toBe("Admin only!");
});

it("allows /ban from admin", async () => {
  const admin = testBot.createUser({ first_name: "Admin" });
  const target = testBot.createUser({ first_name: "Target" });
  const group = testBot.createChat({ type: "supergroup", title: "Test Group" });

  testBot.setOwner(group, admin);
  testBot.setMember(group, target);
  // IMPORTANT: Bot needs can_restrict_members permission to ban users
  testBot.setBotAdmin(group, { can_restrict_members: true });

  // Target sends a message
  const targetMsg = await testBot.sendMessage(target, group, "Hi");

  // Admin bans by replying
  const response = await testBot.sendCommand(admin, group, "/ban", {
    replyToMessageId: targetMsg.sentMessage!.message_id,
  });

  expect(response.text).toBe("User banned.");

  // Verify member status changed
  // Note: "kicked" status in Telegram API = banned (cannot rejoin)
  const memberStatus = testBot.server.memberState.getMember(group.id, target.id);
  expect(memberStatus?.status).toBe("kicked");
});

// Note: Telegram API terminology
// - "kicked" = banned (cannot rejoin via invite links)
// - "left" = not a member but CAN rejoin
// To "kick" (remove but allow rejoining): banChatMember + unbanChatMember

// You can also use MemberState.isAdmin() which returns true for both administrators AND creators:
const isAdmin = testBot.server.memberState.isAdmin(group.id, admin.id);  // true for owner
const isOwner = testBot.server.memberState.isOwner(group.id, admin.id);  // true only for owner
```

### Bot Permission Reference

Use `setBotAdmin()` to grant the bot specific admin permissions:

```typescript
// For ban/kick/restrict/mute operations
testBot.setBotAdmin(group, { can_restrict_members: true });

// For promote/demote operations
testBot.setBotAdmin(group, { can_promote_members: true });

// For pin/unpin operations
testBot.setBotAdmin(group, { can_pin_messages: true });

// For deleting other users' messages
testBot.setBotAdmin(group, { can_delete_messages: true });

// For invite link operations
testBot.setBotAdmin(group, { can_invite_users: true });

// For forum topic operations
testBot.setBotAdmin(forum, { can_manage_topics: true });

// For changing chat title/photo/description
testBot.setBotAdmin(group, { can_change_info: true });

// Multiple permissions at once
testBot.setBotAdmin(group, {
  can_restrict_members: true,
  can_delete_messages: true,
  can_pin_messages: true,
});
```

Without the required permission, the framework throws an error like real Telegram:
```
GrammyError: Call to 'banChatMember' failed! (400: Bad Request: not enough rights to restrict/unrestrict chat member)
```

## Testing Conversations

```typescript
import { session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { createConversationTester } from "grammy-test";

async function orderPizza(conversation: Conversation, ctx: Context) {
  await ctx.reply("What size?");
  const sizeCtx = await conversation.waitFor("message:text");
  const size = sizeCtx.message.text;

  await ctx.reply("What toppings?");
  const toppingsCtx = await conversation.waitFor("message:text");
  const toppings = toppingsCtx.message.text;

  await ctx.reply(`Order: ${size} pizza with ${toppings}!`);
}

// Set up bot with conversations
testBot.use(session({ initial: () => ({}) }));
testBot.use(conversations());
testBot.use(createConversation(orderPizza));
testBot.command("order", (ctx) => ctx.conversation.enter("orderPizza"));

// Test with ConversationTester helper
it("handles pizza order", async () => {
  const user = testBot.createUser();
  const chat = testBot.createChat({ type: "private" });
  const convo = createConversationTester(testBot, user, chat);

  const r1 = await convo.start("/order");
  expect(r1.text).toBe("What size?");

  const r2 = await convo.say("large");
  expect(r2.text).toBe("What toppings?");

  const r3 = await convo.say("pepperoni");
  expect(r3.text).toBe("Order: large pizza with pepperoni!");
});
```

## Testing Polls

```typescript
testBot.command("poll", (ctx) => {
  return ctx.replyWithPoll("Favorite language?", [
    "TypeScript",
    "JavaScript",
    "Python",
  ]);
});

it("creates poll", async () => {
  const user = testBot.createUser();
  const chat = testBot.createChat({ type: "group", title: "Test" });

  const response = await testBot.sendCommand(user, chat, "/poll");

  expect(response.poll).toBeDefined();
  expect(response.poll?.question).toBe("Favorite language?");
  expect(response.poll?.options).toHaveLength(3);
});

it("tracks votes", async () => {
  const user = testBot.createUser();
  const chat = testBot.createChat({ type: "group", title: "Test" });

  const pollResponse = await testBot.sendCommand(user, chat, "/poll");
  await testBot.vote(user, pollResponse.poll!, [0]);  // Vote for TypeScript

  const poll = testBot.server.pollState.getPoll(pollResponse.poll!.id);
  expect(poll?.options[0].voter_count).toBe(1);
});
```

## Testing Payments

```typescript
testBot.command("buy", (ctx) => {
  return ctx.replyWithInvoice(
    "Premium",
    "30 days of premium",
    "premium_30",
    "XTR",
    [{ label: "Premium", amount: 100 }]
  );
});

testBot.on("pre_checkout_query", (ctx) => {
  return ctx.answerPreCheckoutQuery(true);
});

testBot.on("message:successful_payment", (ctx) => {
  return ctx.reply(`Thanks! Payment of ${ctx.message.successful_payment!.total_amount} received.`);
});

it("handles payment flow", async () => {
  const user = testBot.createUser();
  const chat = testBot.createChat({ type: "private" });

  // Send invoice
  const invoiceResponse = await testBot.sendCommand(user, chat, "/buy");
  expect(invoiceResponse.invoice?.title).toBe("Premium");

  // Simulate pre-checkout
  const preCheckout = await testBot.simulatePreCheckout(user, {
    id: "checkout_123",
    currency: "XTR",
    total_amount: 100,
    invoice_payload: "premium_30",
  });
  expect(preCheckout.preCheckoutAnswer?.ok).toBe(true);

  // Simulate successful payment
  const payment = await testBot.simulateSuccessfulPayment(user, chat, {
    currency: "XTR",
    total_amount: 100,
    invoice_payload: "premium_30",
    telegram_payment_charge_id: "charge_123",
    provider_payment_charge_id: "provider_456",
  });
  expect(payment.text).toContain("100");
});
```

## Testing Inline Queries

```typescript
testBot.on("inline_query", (ctx) => {
  return ctx.answerInlineQuery([
    {
      type: "article",
      id: "1",
      title: "Result 1",
      input_message_content: { message_text: "You selected result 1" },
    },
  ]);
});

it("handles inline queries", async () => {
  const user = testBot.createUser();

  const response = await testBot.sendInlineQuery(user, "search term");

  expect(response.inlineResults).toBeDefined();
  expect(response.inlineResults![0].title).toBe("Result 1");
});
```

## Testing Forum Topics

```typescript
testBot.command("topic", async (ctx) => {
  const topic = await ctx.createForumTopic("Discussion");
  return ctx.reply(`Topic created: ${topic.name}`);
});

it("creates forum topic", async () => {
  const admin = testBot.createUser();
  const forum = testBot.createChat({
    type: "supergroup",
    title: "Forum",
    is_forum: true,  // Enable forum mode
  });

  testBot.setOwner(forum, admin);
  // Bot needs can_manage_topics permission for forum operations
  testBot.setBotAdmin(forum, { can_manage_topics: true });

  const response = await testBot.sendCommand(admin, forum, "/topic");
  expect(response.text).toContain("Topic created");
});
```

## Testing File Uploads

```typescript
testBot.on("message:photo", (ctx) => {
  const photo = ctx.message.photo!;
  const largest = photo[photo.length - 1];
  return ctx.reply(`Photo: ${largest.width}x${largest.height}`);
});

testBot.on("message:document", (ctx) => {
  return ctx.reply(`Document: ${ctx.message.document!.file_name}`);
});

it("handles photo", async () => {
  const user = testBot.createUser();
  const chat = testBot.createChat({ type: "private" });

  const response = await testBot.sendPhoto(user, chat, {
    width: 1920,
    height: 1080,
  });

  expect(response.text).toContain("1920x1080");
});

it("handles document", async () => {
  const user = testBot.createUser();
  const chat = testBot.createChat({ type: "private" });

  const response = await testBot.sendDocument(user, chat, {
    fileName: "report.pdf",
    mimeType: "application/pdf",
  });

  expect(response.text).toContain("report.pdf");
});
```

## Error Handling

Errors are handled differently depending on the context:

**Thrown errors (via grammY middleware):**
When bot handlers make API calls that fail, grammY throws `BotError` wrapping `GrammyError`:

```typescript
import { BotError } from "grammy";

it("should error when editing non-existent message", async () => {
  testBot.command("edit", async (ctx) => {
    await ctx.api.editMessageText(ctx.chat.id, 999999, "New text");
  });

  const user = testBot.createUser();
  const chat = testBot.createChat({ type: "private" });

  await expect(testBot.sendCommand(user, chat, "/edit")).rejects.toThrow(BotError);
});
```

**Response errors (simulation methods):**
When simulating user actions that fail validation (e.g., joining via revoked link):

```typescript
it("should error when banned user tries to join", async () => {
  const admin = testBot.createUser();
  const bannedUser = testBot.createUser();
  const group = testBot.createChat({ type: "supergroup", title: "Test" });

  testBot.setOwner(group, admin);
  testBot.setMember(group, bannedUser);
  testBot.server.memberState.ban(group.id, bannedUser.id);

  const link = testBot.server.chatState.createInviteLink(group.id, admin, {});
  const joinResponse = await testBot.simulateJoinViaLink(bannedUser, group, link!.invite_link);

  expect(joinResponse.error).toBeDefined();
  expect(joinResponse.error?.description).toContain("banned");
});
```

## String and Number IDs

The framework accepts both string and number IDs for all API methods, matching real Telegram behavior:

```typescript
// Both of these work identically
await ctx.api.sendMessage(123456, "Hello");
await ctx.api.sendMessage("123456", "Hello");

// Same for user IDs
await ctx.api.getChatMember(chatId, 789);
await ctx.api.getChatMember(chatId, "789");

// And for combined usage
await ctx.api.banChatMember("-100123456", "789");
```

This is useful when working with IDs from external sources (databases, environment variables, etc.) that may be stored as strings.

## Accessing Server State

For advanced assertions, access the state managers directly:

```typescript
// Chat state
const chatData = testBot.server.chatState.getOrCreate(chat);
expect(chatData.permissions?.can_send_messages).toBe(false);

// Member state
const member = testBot.server.memberState.getMember(chatId, userId);
expect(member?.status).toBe("administrator");

// Check admin status (returns true for both administrators AND owners)
expect(testBot.server.memberState.isAdmin(chatId, userId)).toBe(true);
expect(testBot.server.memberState.isOwner(chatId, ownerId)).toBe(true);

// Poll state
const poll = testBot.server.pollState.getPoll(pollId);
expect(poll?.total_voter_count).toBe(5);

// Invite links
const links = testBot.server.chatState.getInviteLinks(chatId);
expect(links[0].member_limit).toBe(100);
```

## Concurrent Testing

The framework supports safe concurrent testing. Each `BotResponse` tracks only the messages and API calls made during that specific request, even when multiple updates run simultaneously.

### Running Updates in Parallel

```typescript
it("handles concurrent commands", async () => {
  const user1 = testBot.createUser({ first_name: "Alice" });
  const user2 = testBot.createUser({ first_name: "Bob" });
  const chat = testBot.createChat({ type: "private" });

  // Run multiple commands in parallel
  const [response1, response2] = await Promise.all([
    testBot.sendCommand(user1, chat, "/start"),
    testBot.sendCommand(user2, chat, "/help"),
  ]);

  // Each response contains only its own bot reply
  expect(response1.text).toBe("Welcome!");
  expect(response2.text).toBe("Available commands...");
});
```

### Using processUpdatesConcurrently

For batch processing, use `processUpdatesConcurrently()`:

```typescript
it("processes multiple updates concurrently", async () => {
  const users = [
    testBot.createUser({ first_name: "Alice" }),
    testBot.createUser({ first_name: "Bob" }),
    testBot.createUser({ first_name: "Charlie" }),
  ];
  const chat = testBot.createChat({ type: "private" });

  // Create updates
  const updates = users.map((user) =>
    testBot.createMessageUpdate(user, chat, "/start")
  );

  // Process all concurrently
  const responses = await testBot.processUpdatesConcurrently(updates);

  // Each response tracked independently
  expect(responses).toHaveLength(3);
  responses.forEach((response) => {
    expect(response.messages).toHaveLength(1);
  });
});
```

### Per-Response API Call Tracking

Each response tracks which API calls were made during that specific request:

```typescript
it("tracks API calls per response", async () => {
  testBot.command("multi", async (ctx) => {
    await ctx.reply("First message");
    await ctx.reply("Second message");
  });

  const user = testBot.createUser();
  const chat = testBot.createChat({ type: "private" });

  const response = await testBot.sendCommand(user, chat, "/multi");

  // Check API calls made during this response
  expect(response.apiCalls).toHaveLength(2);
  expect(response.hasApiCall("sendMessage")).toBe(true);
  expect(response.getApiCallsByMethod("sendMessage")).toHaveLength(2);

  // Get the last API call of a specific type
  const lastCall = response.getLastApiCall("sendMessage");
  expect(lastCall?.payload.text).toBe("Second message");
});

it("isolates API calls in concurrent requests", async () => {
  const user1 = testBot.createUser();
  const user2 = testBot.createUser();
  const chat = testBot.createChat({ type: "private" });

  const [r1, r2] = await Promise.all([
    testBot.sendCommand(user1, chat, "/start"),
    testBot.sendCommand(user2, chat, "/start"),
  ]);

  // Each response tracks only its own API calls
  expect(r1.apiCalls).toHaveLength(1);
  expect(r2.apiCalls).toHaveLength(1);
});
```

## Example Bot

A comprehensive example bot is included in `examples/full-featured-bot/`:

```bash
# Run in production
BOT_TOKEN=your_token npx tsx examples/full-featured-bot/index.ts

# See the test file for how to test it
test/full-featured-bot.test.ts
```

The example bot demonstrates:
- Basic commands with session tracking
- Multi-step conversations
- Inline and reply keyboards
- Formatted messages (Markdown/HTML)
- Media handling
- Polls and quizzes
- Admin commands (ban, kick, mute)
- Owner commands (promote, demote)
- Chat settings (slow mode, lock/unlock)
- Invite links
- Forum topics
- Reactions
- Inline queries
- Payments (invoices and star transactions)
- Bot settings (name, description)
- Premium user features
- Star balance tracking
- Giveaways
- Web app integration
- Story handling
- Passport data processing
- Business connections
- Chat boosts

## Testing Premium Features

```typescript
it("handles premium users", async () => {
  const user = testBot.createUser({ first_name: "Premium User" });
  const chat = testBot.createChat({ type: "private" });

  // Mark user as premium
  testBot.server.memberState.setPremium(user.id, true);

  expect(testBot.server.memberState.isPremium(user.id)).toBe(true);
});
```

## Testing Chat Boosts

```typescript
it("handles chat boosts", async () => {
  const user = testBot.createUser({ first_name: "Booster" });
  const channel = testBot.createChat({ type: "channel", title: "Test Channel" });

  // Simulate a boost (source: "premium", "gift_code", or "giveaway")
  const update = testBot.server.simulateChatBoost(channel, user, "premium");

  expect(update.chat_boost).toBeDefined();

  // Check boost count
  const boostCount = testBot.server.chatState.getBoostCount(channel.id);
  expect(boostCount).toBe(1);
});

it("handles removed chat boost", async () => {
  const user = testBot.createUser({ first_name: "Booster" });
  const channel = testBot.createChat({ type: "channel", title: "Test Channel" });

  // First add a boost
  const boostUpdate = testBot.server.simulateChatBoost(channel, user, "premium");
  const boostId = (boostUpdate.chat_boost as any).boost.boost_id;

  // Then remove it
  const removeUpdate = testBot.server.simulateRemovedChatBoost(channel, boostId);

  expect(removeUpdate.removed_chat_boost).toBeDefined();
  expect(testBot.server.chatState.getBoostCount(channel.id)).toBe(0);
});
```

## Testing Star Transactions

```typescript
testBot.on("message:successful_payment", async (ctx) => {
  const payment = ctx.message.successful_payment!;
  if (payment.invoice_payload === "premium_stars") {
    await ctx.reply(`Thanks for ${payment.total_amount} stars!`);
  }
});

it("handles star payments", async () => {
  const user = testBot.createUser();
  const chat = testBot.createChat({ type: "private" });

  // Create a star transaction
  const transaction = testBot.server.paymentState.createTransaction(
    user.id,
    100,
    { source: { type: "user", user } }
  );

  // Simulate successful payment
  const response = await testBot.simulateSuccessfulPayment(user, chat, {
    currency: "XTR",
    total_amount: 100,
    invoice_payload: "premium_stars",
    telegram_payment_charge_id: transaction.id,
    provider_payment_charge_id: "provider_123",
  });

  expect(response.text).toContain("100 stars");
});
```

## Testing Giveaways

```typescript
it("simulates giveaway", async () => {
  const channel = testBot.createChat({ type: "channel", title: "Test Channel" });

  const update = testBot.server.simulateGiveaway(channel, {
    winnerCount: 5,
    prizeDescription: "Premium subscription",
  });

  expect((update.message as any).giveaway).toBeDefined();
  expect((update.message as any).giveaway.winner_count).toBe(5);
});

it("simulates giveaway completion", async () => {
  const channel = testBot.createChat({ type: "channel", title: "Channel" });
  const winner = testBot.createUser({ first_name: "Winner" });

  const giveawayUpdate = testBot.server.simulateGiveaway(channel);
  const giveawayMessageId = giveawayUpdate.message!.message_id;

  const completionUpdate = testBot.server.simulateGiveawayCompleted(
    channel,
    giveawayMessageId,
    [winner]
  );

  expect((completionUpdate.message as any).giveaway_completed.winner_count).toBe(1);
});
```

## Testing Telegram Passport

```typescript
testBot.command("reject", async (ctx) => {
  await ctx.api.setPassportDataErrors(ctx.from!.id, [
    {
      source: "data",
      type: "personal_details",
      field_name: "first_name",
      data_hash: "abc123",
      message: "Name contains invalid characters",
    },
  ]);
  await ctx.reply("Errors set");
});

it("handles passport data", async () => {
  const user = testBot.createUser();
  const chat = testBot.createChat({ type: "private" });

  // Simulate passport data submission
  const update = testBot.server.simulatePassportData(user, chat, {
    personal_details: { first_name: "John", last_name: "Doe" },
  });

  expect((update.message as any).passport_data).toBeDefined();

  // Set errors on passport data
  const response = await testBot.sendCommand(user, chat, "/reject");
  expect(response.text).toBe("Errors set");

  // Check errors stored
  const errors = testBot.server.passportState.getPassportDataErrors(user.id);
  expect(errors).toHaveLength(1);
});
```

## Testing Business Features

```typescript
it("handles business connection", async () => {
  const user = testBot.createUser({ first_name: "Business User" });
  const chat = testBot.createChat({ type: "private" });

  // Set up business connection
  const connection = testBot.server.businessState.createConnection(user, chat.id, {
    canReply: true,
    isEnabled: true,
  });

  // Simulate business message (params: user, chat, text, connectionId)
  const update = testBot.server.simulateBusinessMessage(user, chat, "Hello", connection.id);

  expect(update.business_message).toBeDefined();
  expect((update.business_message as any).business_connection_id).toBe(connection.id);
});

it("tracks business messages", async () => {
  const user = testBot.createUser({ first_name: "Business User" });
  const chat = testBot.createChat({ type: "private" });

  const connection = testBot.server.businessState.createConnection(user, chat.id);
  testBot.server.simulateBusinessMessage(user, chat, "First message", connection.id);
  testBot.server.simulateBusinessMessage(user, chat, "Second message", connection.id);

  const messages = testBot.server.businessState.getBusinessMessages(connection.id);
  expect(messages).toHaveLength(2);
});
```

## Testing Web App Data

```typescript
testBot.on("message", async (ctx) => {
  if ((ctx.msg as any).web_app_data) {
    const data = JSON.parse((ctx.msg as any).web_app_data.data);
    await ctx.reply(`Received: ${data.item}`);
  }
});

it("handles web app data", async () => {
  const user = testBot.createUser();
  const chat = testBot.createChat({ type: "private" });

  // simulateWebAppData params: user, chat, buttonText, data
  const update = testBot.server.simulateWebAppData(
    user,
    chat,
    "Submit Order",
    JSON.stringify({ item: "Pizza" })
  );

  await testBot.handleUpdate(update);

  // Bot should have replied with the data
  const messages = testBot.server.getAllMessages(chat.id);
  const botResponse = messages.find(m => m.text?.includes("Received: Pizza"));
  expect(botResponse).toBeDefined();
});
```

## Testing Stories

```typescript
testBot.on("message", async (ctx) => {
  if ((ctx.msg as any).story) {
    await ctx.reply("Nice story!");
  }
});

it("handles story messages", async () => {
  const user = testBot.createUser();
  const chat = testBot.createChat({ type: "private" });
  const storyChat = testBot.createChat({ type: "channel", title: "News Channel" });

  const update = testBot.server.simulateStoryMessage(user, chat, 123, storyChat);

  expect((update.message as any).story.id).toBe(123);
});
```

## Testing Input Validation

The framework validates input like real Telegram. Test that your bot handles validation errors correctly:

```typescript
import { BotError } from "grammy";

it("rejects messages over 4096 characters", async () => {
  testBot.command("long", async (ctx) => {
    await ctx.reply("A".repeat(4097));  // Over limit
  });

  const user = testBot.createUser();
  const chat = testBot.createChat({ type: "private" });

  await expect(testBot.sendCommand(user, chat, "/long")).rejects.toThrow(
    /message is too long/
  );
});

it("rejects captions over 1024 characters", async () => {
  testBot.command("photo", async (ctx) => {
    await ctx.replyWithPhoto("https://example.com/img.jpg", {
      caption: "A".repeat(1025),  // Over limit
    });
  });

  const user = testBot.createUser();
  const chat = testBot.createChat({ type: "private" });

  await expect(testBot.sendCommand(user, chat, "/photo")).rejects.toThrow(
    /caption is too long/
  );
});

it("rejects polls with invalid option count", async () => {
  testBot.command("poll", async (ctx) => {
    await ctx.replyWithPoll("Question?", ["Only one option"]);  // Need 2-10
  });

  const user = testBot.createUser();
  const chat = testBot.createChat({ type: "private" });

  await expect(testBot.sendCommand(user, chat, "/poll")).rejects.toThrow(
    /POLL_OPTIONS_COUNT_INVALID/
  );
});

it("rejects quiz without correct_option_id", async () => {
  testBot.command("quiz", async (ctx) => {
    await ctx.replyWithPoll("Question?", ["A", "B"], {
      type: "quiz",
      // Missing correct_option_id
    });
  });

  const user = testBot.createUser();
  const chat = testBot.createChat({ type: "private" });

  await expect(testBot.sendCommand(user, chat, "/quiz")).rejects.toThrow(
    /QUIZ_CORRECT_OPTION_REQUIRED/
  );
});
```

### Validation Reference

| Validation | Limit | Error Pattern |
|------------|-------|---------------|
| Message text | 4096 chars | `message is too long` |
| Caption | 1024 chars | `caption is too long` |
| Photo size | 10 MB | `file is too big` |
| Doc/audio/video | 50 MB | `file is too big` |
| Poll question | 300 chars | `POLL_QUESTION_TOO_LONG` |
| Poll option | 1-100 chars | `POLL_OPTION_EMPTY` / `POLL_OPTION_TOO_LONG` |
| Poll options | 2-10 | `POLL_OPTIONS_COUNT_INVALID` |
| Poll explanation | 200 chars | `POLL_EXPLANATION_TOO_LONG` |
| Quiz correct_option_id | Required, valid index | `QUIZ_CORRECT_OPTION_REQUIRED` / `QUIZ_CORRECT_OPTION_INVALID` |

## Development

```bash
npm install
npm run build
npm test
npm run lint      # Check code with Biome
npm run lint:fix  # Auto-fix lint issues
npm run format    # Format code with Biome
```

### Code Quality

The project uses [Biome](https://biomejs.dev/) for linting and formatting with strict rules enabled:
- No explicit `any` types
- No non-null assertions (`!`)
- Consistent import organization
- All recommended lint rules enabled

Run `npm run lint` before committing to ensure code quality.
