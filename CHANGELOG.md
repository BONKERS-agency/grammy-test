# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.3] - 2025-02-04

### Added

- **Race Condition Safety**: Response tracking now uses `AsyncLocalStorage` for request-scoped isolation, enabling safe concurrent testing
- **Per-Response API Call Tracking**: Each `BotResponse` now tracks its own API calls via `response.apiCalls` and `response.getApiCallsByMethod(method)`
- **Concurrent Testing**: Full support for parallel update processing with isolated responses
  - `processUpdatesConcurrently()` runs multiple updates in parallel
  - Each response correctly tracks only its own messages, edits, and API calls
- **Bot Settings Methods**: `getMyName`, `setMyName`, `getMyDescription`, `setMyDescription`, `getMyShortDescription`, `setMyShortDescription`, `getMyDefaultAdministratorRights`, `setMyDefaultAdministratorRights`
- **Profile Photos**: `getUserProfilePhotos` with `MemberState.addProfilePhoto()` and `getProfilePhotos()`
- **Sticker Support**: `StickerState` for tracking sticker sets and custom emoji stickers, `getStickerSet`, `getCustomEmojiStickers`
- **Chat Boosts**: `simulateChatBoost()`, `simulateRemovedChatBoost()`, `getChatBoostCount`, `getChatBoosts`
- **Web App Support**: `simulateWebAppData()`, `answerWebAppQuery`
- **Business Features**: `BusinessState` for connections and messages, `getBusinessConnection`, `simulateBusinessConnection()`, `simulateBusinessMessage()`
- **Premium Features**: `MemberState.setPremium()`, `isPremium()` for tracking premium users
- **Stars Transactions**: `PaymentState` for star transactions, `getStarTransactions`, `refundStarPayment`, balance tracking
- **Giveaways**: `simulateGiveaway()`, `simulateGiveawayCompleted()`, `simulateGiveawayWinners()`
- **Telegram Passport**: `PassportState` for passport data, `setPassportDataErrors`, `simulatePassportData()`
- **Stories**: `simulateStoryMessage()` for forwarded story messages
- **Input Validation**: Message length (4096), caption length (1024), file sizes, poll validation matching real Telegram
- **Shipping Query Support**: `shippingAnswer` property on `BotResponse` with `_setShippingAnswer()` setter
- Comprehensive test suite with 519 tests covering all features
- Biome linting with strict rules enabled

### Changed

- `TelegramServer.setCurrentResponse()` replaced with `runWithResponse()` using `AsyncLocalStorage`
- All simulation methods in `TestBot` and `WorkerSimulator` updated to use new response context pattern

## [0.1.0] - 2024-XX-XX

### Added

- Initial release
- `TestBot` class for creating test bot instances
- `TelegramServer` for simulating Telegram API responses
- User and chat creation helpers
- Bot permission enforcement matching real Telegram behavior
- Support for:
  - Text messages, commands, and replies
  - Inline and reply keyboards
  - Callback queries
  - Inline queries
  - Conversations (@grammyjs/conversations)
  - Polls and quizzes
  - Payments (invoices, pre-checkout, successful payment)
  - Forum topics
  - Invite links and join requests
  - Message reactions
  - File handling (photos, documents, audio, video)
  - Markdown/HTML parsing to entities
  - Webhook simulation (Express, Hono, Fastify)
- `BotResponse` object for inspecting simulation results
- `createConversationTester` for testing multi-step conversations
- Multi-runtime support (Node.js 18+, Bun, Deno)
