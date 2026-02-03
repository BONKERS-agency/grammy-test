import type { Transformer, RawApi } from "grammy";
import type { TelegramServer } from "./TelegramServer.js";

export interface ApiCallRecord {
  method: string;
  payload: Record<string, unknown>;
  response: unknown;
  timestamp: number;
  error?: Error;
}

/**
 * Creates a grammY transformer that intercepts all API calls
 * and routes them to the TelegramServer instead of the real Telegram API.
 *
 * This operates at the same layer where grammY would normally make HTTP requests,
 * ensuring the bot's behavior is tested as close to production as possible.
 */
export function createTestTransformer(
  server: TelegramServer,
  callLog: ApiCallRecord[]
): Transformer {
  return (async (prev, method, payload, signal) => {
    const record: ApiCallRecord = {
      method,
      payload: payload as Record<string, unknown>,
      response: undefined,
      timestamp: Date.now(),
    };

    try {
      // Route the API call to our simulated Telegram server
      const result = await server.handleApiCall(
        method as keyof RawApi,
        payload as Record<string, unknown>
      );

      record.response = result;
      callLog.push(record);

      // Return in the format grammY expects from the Telegram API
      return { ok: true as const, result };
    } catch (error) {
      record.error = error as Error;
      callLog.push(record);

      // Format error response like Telegram would
      const err = error as Error & { code?: number; description?: string };
      return {
        ok: false as const,
        error_code: err.code ?? 500,
        description: err.description ?? err.message,
      };
    }
  }) as Transformer;
}
