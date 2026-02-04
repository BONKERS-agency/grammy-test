import type { TelegramServer } from "./TelegramServer.js";
import type { ApiCallRecord } from "./TestClient.js";

/**
 * Intercepts global fetch calls to the Telegram API and routes them
 * to our TelegramServer instead.
 *
 * This is necessary because some grammY plugins (like conversations)
 * create new Api instances that don't inherit transformers.
 */
export class FetchInterceptor {
  private server: TelegramServer;
  private originalFetch: typeof fetch;
  private isInstalled = false;
  private apiCalls: ApiCallRecord[];

  constructor(server: TelegramServer, apiCalls: ApiCallRecord[]) {
    this.server = server;
    this.apiCalls = apiCalls;
    this.originalFetch = globalThis.fetch;
  }

  install(): void {
    if (this.isInstalled) return;
    globalThis.fetch = async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      // Check if this is a Telegram API call
      if (url.includes("api.telegram.org")) {
        return this.handleTelegramRequest(url, init);
      }

      // Pass through non-Telegram requests
      return this.originalFetch(input, init);
    };

    this.isInstalled = true;
  }

  uninstall(): void {
    if (!this.isInstalled) return;
    globalThis.fetch = this.originalFetch;
    this.isInstalled = false;
  }

  private async handleTelegramRequest(url: string, init?: RequestInit): Promise<Response> {
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
      } else if (init.body instanceof FormData) {
        for (const [key, value] of init.body.entries()) {
          if (typeof value === "string") {
            try {
              payload[key] = JSON.parse(value);
            } catch {
              payload[key] = value;
            }
          } else {
            // File upload - just store a placeholder
            payload[key] = `[File: ${value.name}]`;
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
      const result = await this.server.handleApiCall(method, payload);
      record.response = result;
      this.apiCalls.push(record);

      return new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const err = error as Error & { code?: number; description?: string };
      record.error = err;
      this.apiCalls.push(record);

      return new Response(
        JSON.stringify({
          ok: false,
          error_code: err.code ?? 400,
          description: err.description ?? err.message,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
  }
}
