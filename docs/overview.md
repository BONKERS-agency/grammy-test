# grammy-test Overview

A testing framework for [grammY](https://grammy.dev/) Telegram bots that enables comprehensive testing without connecting to Telegram servers.

## Purpose

Test your grammY bots with confidence by simulating the complete Telegram interaction flow. All Telegram API calls are intercepted using grammY's transformer architecture and routed to a simulated server, ensuring your tests behave identically to production.

## Key Features

### Realistic Simulation

- **Stateful Telegram Server**: Maintains chats, messages, users, members, and validates requests
- **Transport-Level Interception**: Uses grammY's transformer API, not high-level mocking
- **Accurate Responses**: Returns properly structured data matching Telegram's API
- **BotResponse Objects**: Every simulation returns a rich response object with messages, keyboards, errors, and more

### Full Feature Support

- **Messages**: Text, media (photos, documents, video, audio, voice, stickers), replies, edits, deletions, forwarding
- **Commands**: With arguments and bot_command entities
- **Callbacks**: Inline keyboard button presses with proper query lifecycle
- **Reply Keyboards**: Custom keyboard simulation and removal
- **Chat Types**: Private, group, supergroup (including forums), channel
- **Users & Members**: Custom user creation with roles (owner, admin, member) and permissions
- **Admin Features**: Ban, kick, mute, promote, demote with permission checking
- **Chat Settings**: Slow mode, chat permissions, invite links
- **Conversations Plugin**: Full support for @grammyjs/conversations multi-step flows
- **Polls & Quizzes**: Create polls, track votes, quiz mode with correct answers
- **Inline Queries**: Simulate inline mode with results and chosen results
- **Payments**: Invoices, pre-checkout queries, successful payments
- **Forum Topics**: Create, close, reopen, delete forum topics
- **Reactions**: Add, change, remove message reactions
- **File Handling**: Photos, documents, video, audio with metadata
- **Message Formatting**: Parse Markdown/MarkdownV2/HTML to entities

### Developer Experience

- **Type-Safe**: Full TypeScript support matching grammY types
- **Test Runner Agnostic**: Works with Vitest, Jest, Mocha, or any runner
- **Zero Network**: Everything runs in-memory, fast and deterministic
- **BotResponse Pattern**: Fluent API for asserting bot behavior

### Test Isolation

- Each `TestBot` creates its own independent state (server, chats, users)
- Global fetch is intercepted during tests to support plugins like `@grammyjs/conversations`
- **Always call `dispose()`** in `afterEach` to restore original fetch
- Run tests in separate process from production (standard practice)

## How It Works

```
Your Test          grammY Bot          grammy-test
────────────────────────────────────────────────────
sendCommand() →   handleUpdate()
                       ↓
                  your middleware
                       ↓
                  ctx.reply()
                       ↓
                  transformer  →   TelegramServer
                                        ↓
                                  validates & stores
                                        ↓
                                  returns response
                       ↓
                  response returned
```

## Framework vs Real Telegram

The framework simulates Telegram behavior with realistic permission checking:

**Validated (like real Telegram):**
- Can't ban the chat creator
- Can't ban/restrict other admins (unless bot is creator)
- Chat/user must exist for most operations
- Banned users can't join via invite links
- Revoked/expired invite links fail
- Member limits on invite links are enforced
- **Bot permissions are enforced** - bot must have appropriate admin rights to perform admin actions

**Bot Permission Checking:**
The framework enforces bot permissions just like real Telegram. Before calling admin methods, use `setBotAdmin()` to grant the bot the required permissions:

```typescript
testBot.setOwner(group, admin);
testBot.setBotAdmin(group, { can_restrict_members: true }); // Required for ban/restrict
testBot.setBotAdmin(group, { can_invite_users: true });     // Required for invite links
testBot.setBotAdmin(group, { can_manage_topics: true });    // Required for forum topics
```

**Permission Matrix:**
| Operation | Required Permission |
|-----------|-------------------|
| `banChatMember`, `restrictChatMember` | `can_restrict_members` |
| `setChatSlowModeDelay` | `can_restrict_members` |
| `promoteChatMember` | `can_promote_members` |
| `pinChatMessage`, `unpinChatMessage` | `can_pin_messages` |
| `deleteMessage` (others' messages in groups) | `can_delete_messages` |
| `createChatInviteLink`, `approveChatJoinRequest` | `can_invite_users` |
| `createForumTopic`, `closeForumTopic` | `can_manage_topics` |
| `setChatTitle`, `setChatPhoto` | `can_change_info` |

**Private Chat Behavior:**
- Permission checks are skipped in private chats (most admin operations don't apply there)
- Bot can delete both its own messages AND user messages in private chats (like real Telegram)

**Not validated (minor differences from real Telegram):**
- **getChatMember for unknown users**: Framework returns "left" status. Real Telegram may return an error.

## Tech Stack

- TypeScript (strict mode)
- grammY >= 1.38.0 (peer dependency)
- @grammyjs/conversations (optional, for conversation testing)
- Compatible with any test runner (Vitest, Jest, Mocha, etc.)

## Quick Start

```typescript
import { TestBot } from "grammy-test";

const testBot = new TestBot();
testBot.command("start", (ctx) => ctx.reply("Hello!"));

const user = testBot.createUser({ first_name: "Alice" });
const chat = testBot.createChat({ type: "private" });

const response = await testBot.sendCommand(user, chat, "/start");
expect(response.text).toBe("Hello!");
```

See [usage.md](./usage.md) for comprehensive examples.
