# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
