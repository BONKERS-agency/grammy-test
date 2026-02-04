import type { TelegramServer } from "./TelegramServer.js";
import type { ApiCallRecord } from "./TestClient.js";

/**
 * Creates a mock fetch function that routes Telegram API calls
 * to our TelegramServer.
 */
export function createMockFetch(server: TelegramServer, apiCalls: ApiCallRecord[]): typeof fetch {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    // Extract method name from URL
    // URL format: https://api.telegram.org/bot<token>/<method>
    const methodMatch = url.match(/\/bot[^/]+\/(\w+)/);
    if (!methodMatch) {
      return new Response(JSON.stringify({ ok: false, description: "Invalid API URL" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const method = methodMatch[1];

    // Parse payload from body
    let payload: Record<string, unknown> = {};
    if (init?.body) {
      if (typeof init.body === "string") {
        try {
          payload = JSON.parse(init.body);
        } catch {
          // Try URL-encoded form data
          const params = new URLSearchParams(init.body);
          for (const [key, value] of params) {
            try {
              payload[key] = JSON.parse(value);
            } catch {
              payload[key] = value;
            }
          }
        }
      }
    }

    const record: ApiCallRecord = {
      method,
      payload,
      response: undefined,
      timestamp: Date.now(),
    };

    try {
      const result = await server.handleApiCall(method, payload);
      record.response = result;
      apiCalls.push(record);

      // Also track in the current response for per-request tracking
      const currentResponse = server.getCurrentResponse();
      if (currentResponse) {
        currentResponse._addApiCall(record);
      }

      return new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const err = error as Error & { code?: number; description?: string };
      record.error = err;
      apiCalls.push(record);

      // Also track in the current response for per-request tracking
      const currentResponse = server.getCurrentResponse();
      if (currentResponse) {
        currentResponse._addApiCall(record);
      }

      return new Response(
        JSON.stringify({
          ok: false,
          error_code: err.code ?? 400,
          description: err.description ?? err.message,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
  };
}
