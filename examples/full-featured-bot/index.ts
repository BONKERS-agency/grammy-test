#!/usr/bin/env node
/**
 * Full-Featured Bot - Production Entry Point
 *
 * Run with: npx tsx examples/full-featured-bot/index.ts
 *
 * Environment variables:
 *   BOT_TOKEN - Your Telegram bot token (required)
 *   ADMIN_IDS - Comma-separated list of admin user IDs (optional)
 *   WEBHOOK_URL - Webhook URL for production (optional, uses polling if not set)
 *   WEBHOOK_SECRET - Secret token for webhook verification (optional)
 */

import { webhookCallback } from "grammy";
import { createBot } from "./bot.js";
import type { BotConfig } from "./types.js";

// Load configuration from environment
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("Error: BOT_TOKEN environment variable is required");
  console.error("");
  console.error("Usage:");
  console.error("  BOT_TOKEN=your_token npx tsx examples/full-featured-bot/index.ts");
  process.exit(1);
}

const config: BotConfig = {
  token,
  adminIds: process.env.ADMIN_IDS?.split(",").map((id) => parseInt(id.trim(), 10)).filter(Boolean),
  webhookUrl: process.env.WEBHOOK_URL,
  webhookSecret: process.env.WEBHOOK_SECRET,
};

// Create the bot
const bot = createBot(config);

// Start the bot
async function main() {
  console.log("Starting bot...");

  // Get bot info
  const me = await bot.api.getMe();
  console.log(`Bot: @${me.username} (${me.first_name})`);

  if (config.webhookUrl) {
    // Webhook mode (for production with a web server)
    console.log(`Setting webhook to: ${config.webhookUrl}`);

    await bot.api.setWebhook(config.webhookUrl, {
      secret_token: config.webhookSecret,
    });

    // You would typically integrate this with your web framework
    // Example with express:
    //
    // import express from "express";
    // const app = express();
    // app.use(express.json());
    // app.post("/webhook", webhookCallback(bot, "express"));
    // app.listen(3000);

    console.log("Webhook set. Integrate webhookCallback with your web server.");
    console.log("");
    console.log("Example (Express):");
    console.log('  app.post("/webhook", webhookCallback(bot, "express"));');
  } else {
    // Polling mode (for development)
    console.log("Starting in polling mode...");
    console.log("");
    console.log("Commands available:");
    console.log("  /start - Start the bot");
    console.log("  /help - Show all commands");
    console.log("");

    // Delete any existing webhook
    await bot.api.deleteWebhook();

    // Start polling
    bot.start({
      onStart: () => {
        console.log("Bot is running! Press Ctrl+C to stop.");
      },
    });
  }
}

// Handle graceful shutdown
process.once("SIGINT", () => {
  console.log("\nShutting down...");
  bot.stop();
});

process.once("SIGTERM", () => {
  console.log("\nShutting down...");
  bot.stop();
});

// Run
main().catch((err) => {
  console.error("Failed to start bot:", err);
  process.exit(1);
});
