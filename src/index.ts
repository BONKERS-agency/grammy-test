// Core exports
export { TelegramServer } from "./core/TelegramServer.js";
export { createTestTransformer, type ApiCallRecord } from "./core/TestClient.js";
export { TestBot, createTestBot, type TestBotConfig, type SendMessageOptions } from "./core/TestBot.js";
export { FetchInterceptor } from "./core/FetchInterceptor.js";
export { createMockFetch } from "./core/MockFetch.js";
export {
  ConversationTester,
  createConversationTester,
} from "./core/ConversationTester.js";

// State management
export { ChatState, type StoredInviteLink, type StoredForumTopic, type ChatStateData } from "./core/ChatState.js";
export { MemberState, type StoredMember, type MemberStatus, type RateLimitState } from "./core/MemberState.js";
export { PollState, type StoredPoll, type StoredVote } from "./core/PollState.js";
export { FileState, type StoredFile, type FileType } from "./core/FileState.js";

// Response and factories
export { BotResponse, createBotResponse, type TelegramError } from "./core/BotResponse.js";
export { UpdateFactory, createUpdateFactory, type IdCounters } from "./core/UpdateFactory.js";

// Transport layer
export { UpdateQueue, createUpdateQueue } from "./core/UpdateQueue.js";
export {
  WebhookSimulator,
  createWebhookSimulator,
  type WebhookAdapter,
  type WebhookOptions,
  type MockExpressRequest,
  type MockExpressResponse,
  type MockHonoContext,
  type MockFastifyRequest,
  type MockFastifyReply,
  type WebhookSimulationResult,
} from "./core/WebhookSimulator.js";

// Runner support (for @grammyjs/runner)
export {
  TestUpdateSource,
  TestUpdateSupplier,
  createTestUpdateSource,
} from "./core/RunnerSupport.js";

// Worker/Queue simulation (for message queue patterns)
export {
  WorkerSimulator,
  createWorkerSimulator,
  type QueuedJob,
} from "./core/WorkerSimulator.js";

// Parsing
export { parseFormattedText, formatText, type ParseMode, type ParsedText } from "./core/MarkdownParser.js";

// Type exports
export * from "./types/index.js";
