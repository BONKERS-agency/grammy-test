import type { Update } from "grammy/types";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

/**
 * Adapter types supported for webhook simulation.
 */
export type WebhookAdapter = "express" | "hono" | "fastify" | "std/http" | "aws-lambda" | "node:http";

/**
 * Mock Express-like request object.
 */
export interface MockExpressRequest {
  method: string;
  path: string;
  url: string;
  headers: Record<string, string>;
  body: Update;
  query: Record<string, string>;
}

/**
 * Mock Express-like response object.
 */
export interface MockExpressResponse {
  statusCode: number;
  headers: Map<string, string>;
  body: string | Buffer | null;
  ended: boolean;
  status(code: number): MockExpressResponse;
  setHeader(name: string, value: string): MockExpressResponse;
  set(name: string, value: string): MockExpressResponse;
  send(body?: string | Buffer | object): MockExpressResponse;
  json(body: object): MockExpressResponse;
  end(body?: string | Buffer): MockExpressResponse;
  getHeader(name: string): string | undefined;
}

/**
 * Mock Hono-like context object.
 */
export interface MockHonoContext {
  req: {
    method: string;
    path: string;
    url: string;
    headers: Headers;
    json(): Promise<Update>;
    text(): Promise<string>;
    raw: Request;
  };
  header(name: string, value: string): void;
  status(code: number): void;
  body(data: string | null, status?: number): Response;
  json(data: unknown, status?: number): Response;
  text(data: string, status?: number): Response;
  _status: number;
  _headers: Map<string, string>;
  _body: string | null;
}

/**
 * Mock Fastify-like request/reply objects.
 */
export interface MockFastifyRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Update;
  query: Record<string, string>;
  params: Record<string, string>;
}

export interface MockFastifyReply {
  statusCode: number;
  headers: Map<string, string>;
  sent: boolean;
  code(statusCode: number): MockFastifyReply;
  header(name: string, value: string): MockFastifyReply;
  send(payload?: string | Buffer | object): MockFastifyReply;
  getHeader(name: string): string | undefined;
}

/**
 * Node.js http.IncomingMessage mock.
 */
export interface MockIncomingMessage extends Readable {
  method: string;
  url: string;
  headers: Record<string, string>;
}

/**
 * Node.js http.ServerResponse mock.
 */
export interface MockServerResponse extends EventEmitter {
  statusCode: number;
  statusMessage: string;
  headers: Map<string, string>;
  body: Buffer;
  ended: boolean;
  writeHead(statusCode: number, headers?: Record<string, string>): MockServerResponse;
  setHeader(name: string, value: string): MockServerResponse;
  getHeader(name: string): string | undefined;
  write(chunk: string | Buffer): boolean;
  end(chunk?: string | Buffer): MockServerResponse;
}

/**
 * Result of webhook simulation.
 */
export interface WebhookSimulationResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string | Buffer | null;
}

/**
 * Options for webhook simulation.
 */
export interface WebhookOptions {
  /** Secret token for X-Telegram-Bot-Api-Secret-Token header */
  secretToken?: string;
  /** Custom path (default: /webhook) */
  path?: string;
  /** Custom headers to add */
  customHeaders?: Record<string, string>;
}

/**
 * Constructor options for WebhookSimulator.
 */
export interface WebhookSimulatorOptions {
  /** Secret token for X-Telegram-Bot-Api-Secret-Token header */
  secretToken?: string;
  /** Custom path (default: /webhook) */
  path?: string;
  /** Custom headers to add */
  customHeaders?: Record<string, string>;
}

/**
 * Result of getResult() for Express webhook.
 */
export interface ExpressResult {
  status: number;
  headers: Record<string, string>;
  body: string | Buffer | null;
}

/**
 * Simulates webhook requests for testing grammY's webhookCallback.
 *
 * Creates mock request/response objects that match various web framework APIs:
 * - Express (express.js)
 * - Hono (hono.dev)
 * - Fastify (fastify.io)
 * - Node.js http module
 * - std/http (Deno)
 * - AWS Lambda
 */
export class WebhookSimulator {
  private readonly defaultOptions: WebhookSimulatorOptions;

  constructor(options: WebhookSimulatorOptions = {}) {
    this.defaultOptions = options;
  }

  /**
   * Create mock Express request and response objects.
   * Short method name for convenience.
   */
  createExpress(
    update: Update,
    options: WebhookOptions = {}
  ): { req: MockExpressRequest; res: MockExpressResponse; getResult: () => ExpressResult } {
    const result = this.createExpressRequest(update, { ...this.defaultOptions, ...options });
    return {
      ...result,
      getResult: () => {
        const headers: Record<string, string> = {};
        result.res.headers.forEach((v, k) => { headers[k] = v; });
        return {
          status: result.res.statusCode,
          headers,
          body: result.res.body,
        };
      },
    };
  }

  /**
   * Create mock Hono context.
   * Short method name for convenience.
   */
  createHono(
    update: Update,
    options: WebhookOptions = {}
  ): MockHonoContext & { req: MockHonoContext["req"] & { header: (name: string) => string | undefined } } {
    const ctx = this.createHonoContext(update, { ...this.defaultOptions, ...options });
    // Add header() method to req for convenience
    const enhancedReq = {
      ...ctx.req,
      header: (name: string): string | undefined => ctx.req.headers.get(name) ?? undefined,
    };
    return {
      ...ctx,
      req: enhancedReq,
    };
  }

  /**
   * Create mock Fastify request/reply objects.
   * Short method name for convenience.
   */
  createFastify(
    update: Update,
    options: WebhookOptions = {}
  ): { request: MockFastifyRequest; reply: MockFastifyReply } {
    return this.createFastifyObjects(update, { ...this.defaultOptions, ...options });
  }

  /**
   * Validate a secret token against the configured secret.
   * Returns true if the token matches, or if no secret is configured.
   */
  validateSecretToken(token: string | undefined): boolean {
    if (!this.defaultOptions.secretToken) return true; // No secret configured = allow all
    return token === this.defaultOptions.secretToken;
  }

  /**
   * Create mock Express request and response objects.
   */
  createExpressRequest(
    update: Update,
    options: WebhookOptions = {}
  ): { req: MockExpressRequest; res: MockExpressResponse } {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(options.secretToken && { "x-telegram-bot-api-secret-token": options.secretToken }),
      ...options.customHeaders,
    };

    const req: MockExpressRequest = {
      method: "POST",
      path: options.path ?? "/webhook",
      url: options.path ?? "/webhook",
      headers,
      body: update,
      query: {},
    };

    const res = this.createExpressResponse();

    return { req, res };
  }

  /**
   * Create a mock Express response object.
   */
  createExpressResponse(): MockExpressResponse {
    const res: MockExpressResponse = {
      statusCode: 200,
      headers: new Map(),
      body: null,
      ended: false,

      status(code: number) {
        this.statusCode = code;
        return this;
      },

      setHeader(name: string, value: string) {
        this.headers.set(name.toLowerCase(), value);
        return this;
      },

      set(name: string, value: string) {
        return this.setHeader(name, value);
      },

      send(body?: string | Buffer | object) {
        if (body !== undefined) {
          if (typeof body === "object" && !Buffer.isBuffer(body)) {
            this.body = JSON.stringify(body);
            this.setHeader("content-type", "application/json");
          } else {
            this.body = body as string | Buffer;
          }
        }
        this.ended = true;
        return this;
      },

      json(body: object) {
        this.setHeader("content-type", "application/json");
        this.body = JSON.stringify(body);
        this.ended = true;
        return this;
      },

      end(body?: string | Buffer) {
        if (body !== undefined) {
          this.body = body;
        }
        this.ended = true;
        return this;
      },

      getHeader(name: string) {
        return this.headers.get(name.toLowerCase());
      },
    };

    return res;
  }

  /**
   * Create a mock Hono context.
   */
  createHonoContext(
    update: Update,
    options: WebhookOptions = {}
  ): MockHonoContext {
    const headers = new Headers({
      "content-type": "application/json",
      ...(options.secretToken && { "x-telegram-bot-api-secret-token": options.secretToken }),
      ...options.customHeaders,
    });

    const url = new URL(options.path ?? "/webhook", "http://localhost");
    const body = JSON.stringify(update);

    const request = new Request(url, {
      method: "POST",
      headers,
      body,
    });

    const ctx: MockHonoContext = {
      _status: 200,
      _headers: new Map(),
      _body: null,

      req: {
        method: "POST",
        path: options.path ?? "/webhook",
        url: url.toString(),
        headers,
        async json() {
          return update;
        },
        async text() {
          return body;
        },
        raw: request,
      },

      header(name: string, value: string) {
        ctx._headers.set(name.toLowerCase(), value);
      },

      status(code: number) {
        ctx._status = code;
      },

      body(data: string | null, status?: number): Response {
        if (status !== undefined) ctx._status = status;
        ctx._body = data;
        const responseHeaders: Record<string, string> = {};
        ctx._headers.forEach((v, k) => { responseHeaders[k] = v; });
        return new Response(data, {
          status: ctx._status,
          headers: responseHeaders,
        });
      },

      json(data: unknown, status?: number): Response {
        if (status !== undefined) ctx._status = status;
        ctx._body = JSON.stringify(data);
        ctx._headers.set("content-type", "application/json");
        const responseHeaders: Record<string, string> = {};
        ctx._headers.forEach((v, k) => { responseHeaders[k] = v; });
        return new Response(ctx._body, {
          status: ctx._status,
          headers: responseHeaders,
        });
      },

      text(data: string, status?: number): Response {
        if (status !== undefined) ctx._status = status;
        ctx._body = data;
        ctx._headers.set("content-type", "text/plain");
        const responseHeaders: Record<string, string> = {};
        ctx._headers.forEach((v, k) => { responseHeaders[k] = v; });
        return new Response(ctx._body, {
          status: ctx._status,
          headers: responseHeaders,
        });
      },
    };

    return ctx;
  }

  /**
   * Create mock Fastify request and reply objects.
   */
  createFastifyObjects(
    update: Update,
    options: WebhookOptions = {}
  ): { request: MockFastifyRequest; reply: MockFastifyReply } {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(options.secretToken && { "x-telegram-bot-api-secret-token": options.secretToken }),
      ...options.customHeaders,
    };

    const request: MockFastifyRequest = {
      method: "POST",
      url: options.path ?? "/webhook",
      headers,
      body: update,
      query: {},
      params: {},
    };

    const reply: MockFastifyReply = {
      statusCode: 200,
      headers: new Map(),
      sent: false,

      code(statusCode: number) {
        this.statusCode = statusCode;
        return this;
      },

      header(name: string, value: string) {
        this.headers.set(name.toLowerCase(), value);
        return this;
      },

      send(payload?: string | Buffer | object) {
        this.sent = true;
        return this;
      },

      getHeader(name: string) {
        return this.headers.get(name.toLowerCase());
      },
    };

    return { request, reply };
  }

  /**
   * Create mock Node.js http request/response objects.
   */
  createNodeHttpObjects(
    update: Update,
    options: WebhookOptions = {}
  ): { req: MockIncomingMessage; res: MockServerResponse } {
    const body = JSON.stringify(update);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(body)),
      ...(options.secretToken && { "x-telegram-bot-api-secret-token": options.secretToken }),
      ...options.customHeaders,
    };

    // Create readable stream for request body
    const req = new Readable({
      read() {
        this.push(body);
        this.push(null);
      },
    }) as MockIncomingMessage;

    req.method = "POST";
    req.url = options.path ?? "/webhook";
    req.headers = headers;

    // Create mock response
    const res = new EventEmitter() as MockServerResponse;
    res.statusCode = 200;
    res.statusMessage = "OK";
    res.headers = new Map();
    res.body = Buffer.alloc(0);
    res.ended = false;

    res.writeHead = function (statusCode: number, headers?: Record<string, string>) {
      this.statusCode = statusCode;
      if (headers) {
        for (const [key, value] of Object.entries(headers)) {
          this.headers.set(key.toLowerCase(), value);
        }
      }
      return this;
    };

    res.setHeader = function (name: string, value: string) {
      this.headers.set(name.toLowerCase(), value);
      return this;
    };

    res.getHeader = function (name: string) {
      return this.headers.get(name.toLowerCase());
    };

    res.write = function (chunk: string | Buffer) {
      const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      this.body = Buffer.concat([this.body, buffer]);
      return true;
    };

    res.end = function (chunk?: string | Buffer) {
      if (chunk) {
        this.write(chunk);
      }
      this.ended = true;
      this.emit("finish");
      return this;
    };

    return { req, res };
  }

  /**
   * Create a standard Web Request object (for Deno, Bun, Cloudflare Workers).
   */
  createWebRequest(
    update: Update,
    options: WebhookOptions = {}
  ): Request {
    const headers = new Headers({
      "content-type": "application/json",
      ...(options.secretToken && { "x-telegram-bot-api-secret-token": options.secretToken }),
      ...options.customHeaders,
    });

    const url = new URL(options.path ?? "/webhook", "http://localhost");

    return new Request(url, {
      method: "POST",
      headers,
      body: JSON.stringify(update),
    });
  }

  /**
   * Create mock AWS Lambda event and context.
   */
  createLambdaEvent(
    update: Update,
    options: WebhookOptions = {}
  ): {
    event: {
      httpMethod: string;
      path: string;
      headers: Record<string, string>;
      body: string;
      isBase64Encoded: boolean;
    };
    context: {
      functionName: string;
      functionVersion: string;
      invokedFunctionArn: string;
      memoryLimitInMB: string;
      awsRequestId: string;
      logGroupName: string;
      logStreamName: string;
      getRemainingTimeInMillis(): number;
    };
  } {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(options.secretToken && { "x-telegram-bot-api-secret-token": options.secretToken }),
      ...options.customHeaders,
    };

    const event = {
      httpMethod: "POST",
      path: options.path ?? "/webhook",
      headers,
      body: JSON.stringify(update),
      isBase64Encoded: false,
    };

    const context = {
      functionName: "test-function",
      functionVersion: "$LATEST",
      invokedFunctionArn: "arn:aws:lambda:us-east-1:123456789012:function:test-function",
      memoryLimitInMB: "128",
      awsRequestId: "test-request-id",
      logGroupName: "/aws/lambda/test-function",
      logStreamName: "2024/01/01/[$LATEST]test",
      getRemainingTimeInMillis: () => 30000,
    };

    return { event, context };
  }

  /**
   * Simulate a complete webhook request and get the response.
   * Useful for frameworks that take a Request and return a Response.
   */
  async simulateWebhook(
    adapter: WebhookAdapter,
    update: Update,
    handler: (req: unknown, res?: unknown) => Promise<unknown> | unknown,
    options: WebhookOptions = {}
  ): Promise<WebhookSimulationResult> {
    switch (adapter) {
      case "express": {
        const { req, res } = this.createExpressRequest(update, options);
        await handler(req, res);
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => { headers[k] = v; });
        return {
          statusCode: res.statusCode,
          headers,
          body: res.body,
        };
      }

      case "hono": {
        const ctx = this.createHonoContext(update, options);
        const response = await handler(ctx) as Response | undefined;
        if (response) {
          const headers: Record<string, string> = {};
          response.headers.forEach((v, k) => { headers[k] = v; });
          return {
            statusCode: response.status,
            headers,
            body: await response.text(),
          };
        }
        const resultHeaders: Record<string, string> = {};
        ctx._headers.forEach((v, k) => { resultHeaders[k] = v; });
        return {
          statusCode: ctx._status,
          headers: resultHeaders,
          body: ctx._body,
        };
      }

      case "fastify": {
        const { request, reply } = this.createFastifyObjects(update, options);
        await handler(request, reply);
        const headers: Record<string, string> = {};
        reply.headers.forEach((v, k) => { headers[k] = v; });
        return {
          statusCode: reply.statusCode,
          headers,
          body: null,
        };
      }

      case "std/http":
      case "node:http": {
        const req = this.createWebRequest(update, options);
        const response = await handler(req) as Response;
        const headers: Record<string, string> = {};
        response.headers.forEach((v, k) => { headers[k] = v; });
        return {
          statusCode: response.status,
          headers,
          body: await response.text(),
        };
      }

      case "aws-lambda": {
        const { event, context } = this.createLambdaEvent(update, options);
        const response = await handler(event, context) as {
          statusCode: number;
          headers?: Record<string, string>;
          body?: string;
        };
        return {
          statusCode: response.statusCode,
          headers: response.headers ?? {},
          body: response.body ?? null,
        };
      }

      default:
        throw new Error(`Unsupported adapter: ${adapter}`);
    }
  }
}

/**
 * Create a new WebhookSimulator instance.
 */
export function createWebhookSimulator(): WebhookSimulator {
  return new WebhookSimulator();
}
