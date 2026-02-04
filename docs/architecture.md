# Architecture

grammy-test intercepts grammY's API calls at the transport layer and routes them to a simulated Telegram server, ensuring tests behave identically to production.

## Design Philosophy

- **Minimal mocking**: Intercept at the lowest level possible (grammY's transformer layer)
- **Realistic simulation**: The `TelegramServer` class maintains state and validates requests like Telegram would
- **Use grammY's own architecture**: Leverage transformers rather than replacing internals

## Directory Structure

```
src/
  core/
    TelegramServer.ts      # Simulates Telegram's backend API
    TestClient.ts          # grammY transformer that routes to TelegramServer
    TestBot.ts             # Test harness that ties everything together
    BotResponse.ts         # Rich response object returned by simulations
    UpdateFactory.ts       # Creates realistic Telegram Updates
    MarkdownParser.ts      # Parses Markdown/HTML to message entities
    ChatState.ts           # Chat permissions, slow mode, invite links, boosts
    MemberState.ts         # Member status, restrictions, admin permissions, profile photos, premium
    PollState.ts           # Poll tracking, votes, quiz mode
    FileState.ts           # File storage with file_id mapping
    StickerState.ts        # Sticker sets and custom emoji tracking
    BusinessState.ts       # Business connections and messages
    PaymentState.ts        # Stars transactions and refunds
    PassportState.ts       # Telegram Passport data and errors
    ConversationTester.ts  # Helper for testing multi-step conversations

  types/
    index.ts               # TypeScript definitions

  index.ts                 # Public API exports

examples/
  full-featured-bot/       # Production-ready example bot
    bot.ts                 # Bot handlers covering all features
    types.ts               # Context and session types
    conversations.ts       # Multi-step conversation handlers
    index.ts               # Production entry point

test/
  basic.test.ts            # Basic commands, messages, keyboards
  conversations.test.ts    # Multi-step conversation flows
  admin.test.ts            # Admin commands, roles, permissions
  polls.test.ts            # Poll creation and voting
  payments.test.ts         # Invoices and payment flow
  invites.test.ts          # Invite link management
  forums.test.ts           # Forum topic operations
  files.test.ts            # Photo and document handling
  reactions.test.ts        # Message reactions
  inline.test.ts           # Inline queries
  formatting.test.ts       # Markdown/HTML parsing
  errors.test.ts           # Error handling and edge cases
  edge-cases.test.ts       # Boundary conditions and special cases
  concurrent.test.ts       # Multiple users and parallel operations
  integration.test.ts      # End-to-end scenarios
  full-featured-bot.test.ts # Comprehensive example bot tests
  validation.test.ts       # Input validation (message length, file size, etc.)
  bot-settings.test.ts     # Bot name, description, admin rights
  profile-photos.test.ts   # User profile photo management
  boosts.test.ts           # Chat boost simulation
  webapp.test.ts           # Web app data handling
  business.test.ts         # Business connections and messages
  premium.test.ts          # Premium user features
  stars.test.ts            # Star transactions and refunds
  giveaway.test.ts         # Giveaway simulation
  passport.test.ts         # Telegram Passport data
  stories.test.ts          # Story message handling
                           # Total: 505 tests
```

## Core Components

### TelegramServer

Simulates Telegram's backend servers:

- Maintains state via dedicated state managers (ChatState, MemberState, PollState, FileState)
- Validates API requests with realistic error responses
- **Enforces bot permissions** like real Telegram (ban requires `can_restrict_members`, etc.)
- **Accepts string or number IDs** for chat_id, user_id, message_id, etc. (like real Telegram API)
- Returns properly structured responses matching Telegram's API
- Supports 50+ API methods including admin, payments, forums, and more

```typescript
// The bot's API calls are routed here
const response = await server.handleApiCall("sendMessage", { chat_id: 123, text: "hi" });

// State managers for assertions
server.chatState.getOrCreate(chat);
server.memberState.getMember(chatId, userId);
server.pollState.getPoll(pollId);
```

**Bot Permission Enforcement:**
The server checks bot permissions before executing admin operations:
- `can_restrict_members` - Required for ban, kick, mute, restrict, slow mode
- `can_promote_members` - Required for promote, demote, set admin title
- `can_pin_messages` - Required for pin, unpin messages
- `can_delete_messages` - Required for deleting others' messages in groups (not needed in private chats)
- `can_invite_users` - Required for invite link operations
- `can_manage_topics` - Required for forum topic operations
- `can_change_info` - Required for changing chat title/photo/description

Use `testBot.setBotAdmin(chat, permissions)` to grant the bot admin rights in tests.

### State Managers

**MemberState** tracks member status. Note the Telegram API terminology:
- `"kicked"` status = user is **banned** (removed and cannot rejoin)
- `"left"` status = user left or was kicked-then-unbanned (CAN rejoin)
- `"creator"` status = chat owner (recognized as admin by `isAdmin()` method)
- `"administrator"` status = admin with specific permissions

A "kick" (remove but allow rejoining) requires `banChatMember` + `unbanChatMember`.

The `isAdmin()` method returns `true` for both administrators AND creators (owners), since owners have all admin rights.

**ChatState** tracks chat settings (slow mode, permissions, invite links, boosts).

**PollState** tracks poll options, votes, and closed status.

**FileState** stores uploaded files with file_id mapping.

**StickerState** tracks sticker sets and custom emoji stickers.

**BusinessState** manages business connections and business messages.

**PaymentState** tracks star transactions, balances, and refunds.

**PassportState** stores Telegram Passport data and errors per user.

### BotResponse

Rich response object returned by all simulation methods:

```typescript
interface BotResponse {
  messages: Message[];           // Messages sent by bot
  text: string | undefined;      // Last message text
  texts: string[];               // All message texts
  editedMessages: Message[];     // Edited messages
  editedText: string | undefined;
  deletedMessages: Message[];    // Deleted messages
  keyboard?: { inline?, reply? }; // Keyboards from last message
  callbackAnswer?: { text?, showAlert? };
  poll?: Poll;
  invoice?: { title, currency, total_amount };
  inlineResults?: InlineQueryResult[];
  preCheckoutAnswer?: { ok, errorMessage? };
  entities?: MessageEntity[];    // Parsed formatting entities
  error?: { code, description }; // API errors
  apiCalls: ApiCallRecord[];     // All API calls made

  // Helpers
  hasText(text: string): boolean;
  hasTextContaining(substring: string): boolean;
  hasEntity(type: string): boolean;
}
```

### TestClient (Transformer)

A grammY transformer that intercepts all API calls:

```typescript
// Installed via grammY's standard transformer API
bot.api.config.use(createTestTransformer(server, callLog));
```

This works exactly how grammY processes API calls in production, but routes to our server instead of Telegram's.

### TestBot

The test harness that:

1. Creates a `TelegramServer` with all state managers
2. Installs the test transformer
3. **Intercepts global fetch** for `api.telegram.org` (needed for plugins that create new Api instances)
4. Provides methods to simulate user actions (returning BotResponse)
5. Exposes role helpers: `setOwner()`, `setAdmin()`, `setMember()`, `setBotAdmin()`, `setBotMember()`
6. Provides simulation methods for all Telegram features

**Bot Permission Setup:**
```typescript
// Set bot as admin with specific permissions
testBot.setBotAdmin(group, { can_restrict_members: true, can_delete_messages: true });

// Set bot as regular member (no admin rights)
testBot.setBotMember(group);
```

**Important:** Call `dispose()` in `afterEach` to restore the original global fetch.

## Data Flow

```
Test Code                    grammY                      grammy-test
─────────────────────────────────────────────────────────────────────
testBot.sendMessage()  →   bot.handleUpdate()
                                  ↓
                           middleware runs
                                  ↓
                           ctx.reply()
                                  ↓
                           bot.api.sendMessage()
                                  ↓
                           transformer chain    →    TestClient
                                                         ↓
                                                   TelegramServer
                                                         ↓
                                                   (stores message)
                                                         ↓
                                                   returns response
                                  ↓
                           response to ctx.reply()
```

## Extending

### Adding API Methods

Add handlers to `TelegramServer.apiHandlers`:

```typescript
private apiHandlers = {
  // ... existing handlers

  newMethod: (payload) => {
    // Validate payload
    // Update state
    // Return response matching Telegram's format
  }
};
```

### Adding Update Types

Add simulation methods to `TelegramServer`:

```typescript
simulateInlineQuery(user: User, query: string): Update {
  // Create properly structured Update
}
```

### Available Simulation Methods

The `TelegramServer` class provides these simulation methods:

| Method | Description |
|--------|-------------|
| `simulateChatBoost(chat, user, source)` | Simulate a user boosting a chat |
| `simulateRemovedChatBoost(chat, boostId)` | Simulate a boost being removed |
| `simulateWebAppData(user, chat, buttonText, data)` | Simulate web app form submission |
| `simulateBusinessConnection(user, chatId, options)` | Simulate business connection update |
| `simulateBusinessMessage(user, chat, text, connectionId)` | Simulate message via business connection |
| `simulatePassportData(user, chat, data, options)` | Simulate Telegram Passport submission |
| `simulateGiveaway(chat, options)` | Simulate giveaway creation |
| `simulateGiveawayCompleted(chat, messageId, winners, options)` | Simulate giveaway completion |
| `simulateGiveawayWinners(chat, messageId, winners, options)` | Simulate winner announcement |
| `simulateStoryMessage(user, chat, storyId, storyChat)` | Simulate forwarded story |

### State Manager APIs

Each state manager exposes methods for both simulation and assertion:

**ChatState:**
- `getOrCreate(chat)`, `setChatPermissions(chatId, permissions)`
- `createInviteLink(chatId, creator, options)`, `getInviteLinks(chatId)`
- `createTopic(chatId, name, iconColor)`, `closeTopic(chatId, topicId)`
- `addBoost(chatId, source)`, `removeBoost(chatId, boostId)`, `getBoostCount(chatId)`
- `getMessage(chatId, messageId)`, `getAllMessages(chatId)`

**MemberState:**
- `setMember(chatId, user, status)`, `getMember(chatId, userId)`
- `isAdmin(chatId, userId)`, `isOwner(chatId, userId)`
- `ban(chatId, userId)`, `unban(chatId, userId)`, `restrict(chatId, userId, permissions)`
- `setPremium(userId, isPremium)`, `isPremium(userId)`
- `addProfilePhoto(userId)`, `getProfilePhotos(userId)`

**PollState:**
- `createPoll(...)`, `getPoll(pollId)`, `vote(pollId, optionIds)`, `closePoll(pollId)`

**FileState:**
- `storeFile(type, metadata)`, `getFile(fileId)`, `getDownloadUrl(fileId)`

**StickerState:**
- `createStickerSet(name, title, type, stickers)`, `getStickerSet(name)`
- `getCustomEmojiStickers(customEmojiIds)`

**BusinessState:**
- `createConnection(user, chatId, options)`, `getConnection(connectionId)`
- `trackBusinessMessage(connectionId, messageId, chatId)`

**PaymentState:**
- `createTransaction(userId, amount, options)`, `getStarTransactions(userId)`
- `refundStarPayment(userId, chargeId)`, `getStarBalance(userId)`

**PassportState:**
- `setPassportData(userId, data)`, `getPassportData(userId)`
- `setPassportDataErrors(userId, errors)`, `getPassportDataErrors(userId)`
