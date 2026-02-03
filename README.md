# grammy-test

Testing framework for [grammY](https://grammy.dev/) Telegram bots - simulate Telegram interactions without making API calls.

[![npm version](https://img.shields.io/npm/v/@bonkers-agency/grammy-test.svg)](https://www.npmjs.com/package/@bonkers-agency/grammy-test)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Zero Network Calls** - All Telegram API interactions are simulated in-memory
- **Realistic Simulation** - Stateful server with proper validation and error handling
- **Full grammY Support** - Works with commands, callbacks, conversations, inline queries, and more
- **Bot Permission Enforcement** - Simulates Telegram's admin permission system
- **Type-Safe** - Full TypeScript support matching grammY types
- **Test Runner Agnostic** - Works with Vitest, Jest, Mocha, or any test framework
- **Multi-Runtime** - Supports Node.js 18+, Bun, and Deno

## Installation

```bash
npm install @bonkers-agency/grammy-test --save-dev
```

## Quick Start

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestBot } from "@bonkers-agency/grammy-test";

describe("MyBot", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
    testBot.command("start", (ctx) => ctx.reply("Hello!"));
  });

  afterEach(() => {
    testBot.dispose(); // Always clean up!
  });

  it("responds to /start", async () => {
    const user = testBot.createUser({ first_name: "Alice" });
    const chat = testBot.createChat({ type: "private" });

    const response = await testBot.sendCommand(user, chat, "/start");

    expect(response.text).toBe("Hello!");
  });
});
```

## Testing Admin Commands

The framework enforces bot permissions like real Telegram:

```typescript
it("bans a user", async () => {
  const admin = testBot.createUser({ first_name: "Admin" });
  const target = testBot.createUser({ first_name: "Target" });
  const group = testBot.createChat({ type: "supergroup", title: "Test" });

  testBot.setOwner(group, admin);
  testBot.setMember(group, target);
  // Bot needs permission to ban users
  testBot.setBotAdmin(group, { can_restrict_members: true });

  testBot.command("ban", async (ctx) => {
    await ctx.banChatMember(target.id);
    await ctx.reply("Banned!");
  });

  const response = await testBot.sendCommand(admin, group, "/ban");
  expect(response.text).toBe("Banned!");
});
```

## Testing Conversations

```typescript
import { session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { createConversationTester } from "@bonkers-agency/grammy-test";

// Set up bot with conversations
testBot.use(session({ initial: () => ({}) }));
testBot.use(conversations());
testBot.use(createConversation(myConversation));

// Test multi-step flow
const convo = createConversationTester(testBot, user, chat);
const r1 = await convo.start("/survey");
expect(r1.text).toBe("What's your name?");

const r2 = await convo.say("Alice");
expect(r2.text).toBe("Nice to meet you, Alice!");
```

## BotResponse Object

Every simulation returns a rich response object:

```typescript
const response = await testBot.sendCommand(user, chat, "/menu");

response.text;              // Last message text
response.texts;             // All message texts
response.messages;          // Full Message objects
response.keyboard?.inline;  // Inline keyboard buttons
response.keyboard?.reply;   // Reply keyboard buttons
response.callbackAnswer;    // Callback query answer
response.poll;              // Poll object
response.invoice;           // Invoice object
response.error;             // API error if any
```

## Bot Permission Reference

```typescript
// Ban, kick, mute, restrict, slow mode
testBot.setBotAdmin(group, { can_restrict_members: true });

// Promote, demote, set admin title
testBot.setBotAdmin(group, { can_promote_members: true });

// Pin, unpin messages
testBot.setBotAdmin(group, { can_pin_messages: true });

// Delete other users' messages
testBot.setBotAdmin(group, { can_delete_messages: true });

// Invite links, approve/decline join requests
testBot.setBotAdmin(group, { can_invite_users: true });

// Forum topics
testBot.setBotAdmin(forum, { can_manage_topics: true });

// Change chat title, photo, description
testBot.setBotAdmin(group, { can_change_info: true });
```

## Supported Features

- Messages (text, media, replies, edits, deletions)
- Commands with arguments
- Inline & reply keyboards
- Callback queries
- Inline queries
- Conversations (@grammyjs/conversations)
- Polls & quizzes
- Payments (invoices, pre-checkout, successful payment)
- Forum topics
- Invite links & join requests
- Message reactions
- File handling (photos, documents, audio, video)
- Markdown/HTML parsing to entities
- Webhook simulation (Express, Hono, Fastify, etc.)

## Documentation

- [Overview](./docs/overview.md) - Features and how it works
- [Usage Guide](./docs/usage.md) - Detailed examples
- [Architecture](./docs/architecture.md) - Internal design

## Runtime Support

| Runtime | Status |
|---------|--------|
| Node.js 18+ | Full support |
| Bun | Full support |
| Deno | Works via `npm:` specifier |

## License

MIT
