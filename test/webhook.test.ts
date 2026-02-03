import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestBot, WebhookSimulator } from "../src/index.js";

describe("Webhook Simulation", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("Express Webhook", () => {
    it("should create Express request/response objects", () => {
      const user = testBot.createUser({ first_name: "Alice" });
      const chat = testBot.createChat({ type: "private" });
      const update = testBot.server.updateFactory.createTextMessage(user, chat, "Hello");

      const webhook = new WebhookSimulator();
      const { req, res } = webhook.createExpress(update);

      expect(req.body).toEqual(update);
      expect(req.method).toBe("POST");
      expect(req.headers["content-type"]).toBe("application/json");
      expect(typeof res.status).toBe("function");
      expect(typeof res.end).toBe("function");
    });

    it("should include secret token header", () => {
      const user = testBot.createUser({ first_name: "Bob" });
      const chat = testBot.createChat({ type: "private" });
      const update = testBot.server.updateFactory.createTextMessage(user, chat, "Hello");

      const webhook = new WebhookSimulator({ secretToken: "my-secret-123" });
      const { req } = webhook.createExpress(update);

      expect(req.headers["x-telegram-bot-api-secret-token"]).toBe("my-secret-123");
    });

    it("should track response status", async () => {
      const user = testBot.createUser({ first_name: "Charlie" });
      const chat = testBot.createChat({ type: "private" });
      const update = testBot.server.updateFactory.createTextMessage(user, chat, "Test");

      const webhook = new WebhookSimulator();
      const { res, getResult } = webhook.createExpress(update);

      // Simulate Express handler setting status and ending response
      res.status(200).end();

      const result = getResult();
      expect(result.status).toBe(200);
    });
  });

  describe("Hono Webhook", () => {
    it("should create Hono context", () => {
      const user = testBot.createUser({ first_name: "Dave" });
      const chat = testBot.createChat({ type: "private" });
      const update = testBot.server.updateFactory.createTextMessage(user, chat, "Hello");

      const webhook = new WebhookSimulator();
      const ctx = webhook.createHono(update);

      expect(ctx.req).toBeDefined();
      expect(typeof ctx.json).toBe("function");
      expect(typeof ctx.text).toBe("function");
    });

    it("should include secret token in Hono request", () => {
      const user = testBot.createUser({ first_name: "Eve" });
      const chat = testBot.createChat({ type: "private" });
      const update = testBot.server.updateFactory.createTextMessage(user, chat, "Test");

      const webhook = new WebhookSimulator({ secretToken: "hono-secret" });
      const ctx = webhook.createHono(update);

      expect(ctx.req.header("x-telegram-bot-api-secret-token")).toBe("hono-secret");
    });

    it("should parse JSON body in Hono context", async () => {
      const user = testBot.createUser({ first_name: "Frank" });
      const chat = testBot.createChat({ type: "private" });
      const update = testBot.server.updateFactory.createTextMessage(user, chat, "JSON test");

      const webhook = new WebhookSimulator();
      const ctx = webhook.createHono(update);

      const body = await ctx.req.json();
      expect(body).toEqual(update);
    });
  });

  describe("Fastify Webhook", () => {
    it("should create Fastify request/reply objects", () => {
      const user = testBot.createUser({ first_name: "Grace" });
      const chat = testBot.createChat({ type: "private" });
      const update = testBot.server.updateFactory.createTextMessage(user, chat, "Hello");

      const webhook = new WebhookSimulator();
      const { request, reply } = webhook.createFastify(update);

      expect(request.body).toEqual(update);
      expect(typeof reply.code).toBe("function");
      expect(typeof reply.send).toBe("function");
    });

    it("should include secret token in Fastify request", () => {
      const user = testBot.createUser({ first_name: "Harry" });
      const chat = testBot.createChat({ type: "private" });
      const update = testBot.server.updateFactory.createTextMessage(user, chat, "Test");

      const webhook = new WebhookSimulator({ secretToken: "fastify-secret" });
      const { request } = webhook.createFastify(update);

      expect(request.headers["x-telegram-bot-api-secret-token"]).toBe("fastify-secret");
    });
  });

  describe("Webhook with TestBot", () => {
    it("should simulate webhook for text message", async () => {
      testBot.on("message:text", (ctx) => ctx.reply(`Got: ${ctx.message.text}`));

      const user = testBot.createUser({ first_name: "Ivy" });
      const chat = testBot.createChat({ type: "private" });
      const update = testBot.server.updateFactory.createTextMessage(user, chat, "Webhook test");

      const response = await testBot.simulateWebhook("express", update);

      expect(response.text).toBe("Got: Webhook test");
    });

    it("should simulate webhook for command", async () => {
      testBot.command("start", (ctx) => ctx.reply("Welcome via webhook!"));

      const user = testBot.createUser({ first_name: "Jack" });
      const chat = testBot.createChat({ type: "private" });
      const update = testBot.server.updateFactory.createCommand(user, chat, "/start");

      const response = await testBot.simulateWebhook("express", update);

      expect(response.text).toBe("Welcome via webhook!");
    });

    it("should simulate webhook for callback query", async () => {
      testBot.callbackQuery("action", async (ctx) => {
        await ctx.answerCallbackQuery("Done!");
      });

      const user = testBot.createUser({ first_name: "Kate" });
      const chat = testBot.createChat({ type: "private" });

      // First send a message to click button on
      const msg = await testBot.sendMessage(user, chat, "test");
      const response = await testBot.clickButton(user, chat, "action", msg.messages[0]);

      expect(response.callbackAnswer?.text).toBe("Done!");
    });

    it("should handle Hono webhook", async () => {
      testBot.on("message:text", (ctx) => ctx.reply("Hono works!"));

      const user = testBot.createUser({ first_name: "Leo" });
      const chat = testBot.createChat({ type: "private" });
      const update = testBot.server.updateFactory.createTextMessage(user, chat, "Hono");

      const response = await testBot.simulateWebhook("hono", update);

      expect(response.text).toBe("Hono works!");
    });

    it("should handle Fastify webhook", async () => {
      testBot.on("message:text", (ctx) => ctx.reply("Fastify works!"));

      const user = testBot.createUser({ first_name: "Mike" });
      const chat = testBot.createChat({ type: "private" });
      const update = testBot.server.updateFactory.createTextMessage(user, chat, "Fastify");

      const response = await testBot.simulateWebhook("fastify", update);

      expect(response.text).toBe("Fastify works!");
    });
  });

  describe("Secret Token Validation", () => {
    it("should validate secret token matches", () => {
      const webhook = new WebhookSimulator({ secretToken: "correct-token" });

      expect(webhook.validateSecretToken("correct-token")).toBe(true);
      expect(webhook.validateSecretToken("wrong-token")).toBe(false);
      expect(webhook.validateSecretToken(undefined)).toBe(false);
    });

    it("should allow any token when no secret is configured", () => {
      const webhook = new WebhookSimulator();

      expect(webhook.validateSecretToken("any-token")).toBe(true);
      expect(webhook.validateSecretToken(undefined)).toBe(true);
    });
  });
});
