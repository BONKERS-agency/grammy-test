# grammy-test

grammY bot testing framework - simulates Telegram interactions without API calls.

## Documentation

- [docs/overview.md](docs/overview.md) - Project purpose and features
- [docs/architecture.md](docs/architecture.md) - Directory structure and design
- [docs/usage.md](docs/usage.md) - Installation and examples

## Rules

### Code Style
- TypeScript strict mode
- Async/await for all async operations
- Export types alongside implementations
- Run `npm run lint` before committing (Biome)
- No explicit `any` - use proper types
- No non-null assertions (`!`) - use optional chaining (`?.`)

### Testing
- All features must have corresponding tests
- Tests should be test-runner agnostic (no Jest/Vitest-specific APIs in core)

### API Design
- Match grammY's type signatures where applicable
- Keep public API surface minimal
- All Telegram features must be supportable, but implement incrementally

### No Network
- Never make actual HTTP calls
- All Telegram API interactions must be mocked/intercepted
