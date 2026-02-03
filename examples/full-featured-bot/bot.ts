import { Bot, session, GrammyError, HttpError, InputFile } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import type { MyContext, BotConfig } from "./types.js";
import { createInitialSessionData } from "./types.js";
import {
  orderConversation,
  verifyAgeConversation,
  feedbackConversation,
  settingsConversation,
} from "./conversations.js";

/**
 * Create and configure the bot with all handlers.
 *
 * @param configOrBot - Either a BotConfig for production, or an existing Bot instance for testing
 * @returns The configured bot
 *
 * @example
 * // Production usage
 * const bot = createBot({ token: process.env.BOT_TOKEN });
 * bot.start();
 *
 * @example
 * // Testing usage
 * const testBot = new TestBot<MyContext>();
 * createBot(testBot);
 * const response = await testBot.sendCommand(user, chat, "/start");
 */
export function createBot(configOrBot: BotConfig | Bot<MyContext>): Bot<MyContext> {
  const isExistingBot = configOrBot instanceof Bot;
  const bot = isExistingBot
    ? configOrBot
    : new Bot<MyContext>(configOrBot.token);

  const adminIds = (isExistingBot ? [] : configOrBot.adminIds) ?? [];

  // ============================================================
  // MIDDLEWARE SETUP (only for new bots - tests set up their own)
  // ============================================================

  if (!isExistingBot) {
    // Session middleware
    bot.use(
      session({
        initial: createInitialSessionData,
      })
    );

    // Conversations middleware
    bot.use(conversations());

    // Register conversations
    bot.use(createConversation(orderConversation));
    bot.use(createConversation(verifyAgeConversation));
    bot.use(createConversation(feedbackConversation));
    bot.use(createConversation(settingsConversation));
  }

  // Stats tracking middleware (always add - lightweight)
  bot.use(async (ctx, next) => {
    if (ctx.message) {
      ctx.session.messageCount++;
    }
    await next();
  });

  // ============================================================
  // BASIC COMMANDS
  // ============================================================

  bot.command("start", async (ctx) => {
    ctx.session.commandCount++;
    const name = ctx.from?.first_name ?? "there";
    await ctx.reply(
      `Welcome, ${name}!\n\n` +
        `I'm a full-featured demo bot. Use /help to see all commands.\n\n` +
        `Your stats:\n` +
        `- Messages: ${ctx.session.messageCount}\n` +
        `- Commands: ${ctx.session.commandCount}`
    );
  });

  bot.command("help", async (ctx) => {
    ctx.session.commandCount++;
    await ctx.reply(
      `*Available Commands*\n\n` +
        `*Basic*\n` +
        `/start \\- Start the bot\n` +
        `/help \\- Show this help\n` +
        `/echo \\<text\\> \\- Echo your text\n` +
        `/stats \\- Show your stats\n\n` +
        `*Conversations*\n` +
        `/order \\- Order a pizza\n` +
        `/verify \\- Age verification\n` +
        `/feedback \\- Leave feedback\n` +
        `/settings \\- User settings\n\n` +
        `*Keyboards*\n` +
        `/menu \\- Inline keyboard demo\n` +
        `/keyboard \\- Reply keyboard demo\n\n` +
        `*Media*\n` +
        `/photo \\- Send a photo\n` +
        `/document \\- Send a document\n` +
        `/location \\- Send a location\n\n` +
        `*Groups*\n` +
        `/poll \\- Create a poll\n` +
        `/quiz \\- Create a quiz\n` +
        `/pin \\- Pin a message \\(reply\\)\n\n` +
        `*Admin \\(groups\\)*\n` +
        `/ban \\- Ban user \\(reply\\)\n` +
        `/kick \\- Kick user \\(reply\\)\n` +
        `/mute \\<seconds\\> \\- Mute user\n` +
        `/unmute \\- Unmute user\n` +
        `/slowmode \\<seconds\\> \\- Set slow mode\n` +
        `/lock \\- Lock chat\n` +
        `/unlock \\- Unlock chat\n` +
        `/invite \\- Create invite link\n\n` +
        `*Owner \\(groups\\)*\n` +
        `/promote \\- Promote to admin\n` +
        `/demote \\- Demote admin\n\n` +
        `*Forums*\n` +
        `/topic \\<name\\> \\- Create topic\n` +
        `/closetopic \\- Close topic\n` +
        `/reopentopic \\- Reopen topic\n\n` +
        `*Payments*\n` +
        `/buy \\- Purchase premium\n\n` +
        `*Inline Mode*\n` +
        `Type @botusername in any chat`,
      { parse_mode: "MarkdownV2" }
    );
  });

  bot.command("echo", async (ctx) => {
    ctx.session.commandCount++;
    const text = ctx.match || "Nothing to echo";
    await ctx.reply(`Echo: ${text}`);
  });

  bot.command("stats", async (ctx) => {
    ctx.session.commandCount++;
    await ctx.reply(
      `Your Statistics:\n\n` +
        `Messages sent: ${ctx.session.messageCount}\n` +
        `Commands used: ${ctx.session.commandCount}\n` +
        `Notifications: ${ctx.session.notifications ? "Enabled" : "Disabled"}`
    );
  });

  // ============================================================
  // CONVERSATIONS
  // ============================================================

  bot.command("order", async (ctx) => {
    ctx.session.commandCount++;
    await ctx.conversation.enter("orderConversation");
  });

  bot.command("verify", async (ctx) => {
    ctx.session.commandCount++;
    await ctx.conversation.enter("verifyAgeConversation");
  });

  bot.command("feedback", async (ctx) => {
    ctx.session.commandCount++;
    await ctx.conversation.enter("feedbackConversation");
  });

  bot.command("settings", async (ctx) => {
    ctx.session.commandCount++;
    await ctx.conversation.enter("settingsConversation");
  });

  // ============================================================
  // KEYBOARDS
  // ============================================================

  bot.command("menu", async (ctx) => {
    ctx.session.commandCount++;
    await ctx.reply("Choose an option:", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Option A", callback_data: "menu_a" },
            { text: "Option B", callback_data: "menu_b" },
          ],
          [
            { text: "Option C", callback_data: "menu_c" },
            { text: "Cancel", callback_data: "menu_cancel" },
          ],
        ],
      },
    });
  });

  bot.callbackQuery("menu_a", async (ctx) => {
    await ctx.answerCallbackQuery("You chose A!");
    await ctx.editMessageText("You selected Option A");
  });

  bot.callbackQuery("menu_b", async (ctx) => {
    await ctx.answerCallbackQuery("You chose B!");
    await ctx.editMessageText("You selected Option B");
  });

  bot.callbackQuery("menu_c", async (ctx) => {
    await ctx.answerCallbackQuery("You chose C!");
    await ctx.editMessageText("You selected Option C");
  });

  bot.callbackQuery("menu_cancel", async (ctx) => {
    await ctx.answerCallbackQuery("Cancelled");
    await ctx.deleteMessage();
  });

  bot.command("keyboard", async (ctx) => {
    ctx.session.commandCount++;
    await ctx.reply("Quick actions:", {
      reply_markup: {
        keyboard: [
          [{ text: "Help" }, { text: "Stats" }],
          [{ text: "Settings" }, { text: "Cancel" }],
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
      },
    });
  });

  // Reply keyboard handlers
  bot.hears("Help", (ctx) => ctx.reply("Use /help for available commands"));
  bot.hears("Stats", async (ctx) => {
    await ctx.reply(`Messages: ${ctx.session.messageCount}, Commands: ${ctx.session.commandCount}`);
  });
  bot.hears("Settings", async (ctx) => {
    await ctx.conversation.enter("settingsConversation");
  });
  bot.hears("Cancel", async (ctx) => {
    await ctx.reply("Keyboard removed.", {
      reply_markup: { remove_keyboard: true },
    });
  });

  // ============================================================
  // FORMATTED MESSAGES
  // ============================================================

  bot.command("format", async (ctx) => {
    ctx.session.commandCount++;
    await ctx.reply(
      "*Bold* _Italic_ `Code` ~Strikethrough~ __Underline__\n" +
        "||Spoiler|| [Link](https://grammy.dev)\n" +
        "```typescript\nconst bot = new Bot(token);\n```",
      { parse_mode: "MarkdownV2" }
    );
  });

  bot.command("html", async (ctx) => {
    ctx.session.commandCount++;
    await ctx.reply(
      "<b>Bold</b> <i>Italic</i> <code>Code</code>\n" +
        "<s>Strikethrough</s> <u>Underline</u>\n" +
        '<span class="tg-spoiler">Spoiler</span>\n' +
        '<a href="https://grammy.dev">Link</a>\n' +
        "<pre><code class=\"language-typescript\">const bot = new Bot(token);</code></pre>",
      { parse_mode: "HTML" }
    );
  });

  // ============================================================
  // MEDIA
  // ============================================================

  bot.command("photo", async (ctx) => {
    ctx.session.commandCount++;
    // Send a photo from URL
    await ctx.replyWithPhoto(
      "https://grammy.dev/images/grammY.png",
      { caption: "grammY Logo" }
    );
  });

  bot.command("document", async (ctx) => {
    ctx.session.commandCount++;
    // Create a simple text file
    const content = Buffer.from("Hello from the bot!\n\nThis is a test document.");
    await ctx.replyWithDocument(new InputFile(content, "hello.txt"), {
      caption: "Here's a document for you",
    });
  });

  bot.command("location", async (ctx) => {
    ctx.session.commandCount++;
    // Send grammY headquarters (fictional)
    await ctx.replyWithLocation(51.5074, -0.1278); // London coordinates
  });

  // Handle incoming media
  bot.on("message:photo", async (ctx) => {
    const photo = ctx.message.photo;
    const largest = photo[photo.length - 1];
    await ctx.reply(
      `Photo received!\n` +
        `Size: ${largest.width}x${largest.height}\n` +
        `File ID: ${largest.file_id.substring(0, 20)}...`
    );
  });

  bot.on("message:document", async (ctx) => {
    const doc = ctx.message.document;
    await ctx.reply(
      `Document received!\n` +
        `Name: ${doc.file_name}\n` +
        `Type: ${doc.mime_type}\n` +
        `Size: ${doc.file_size ? Math.round(doc.file_size / 1024) + " KB" : "Unknown"}`
    );
  });

  bot.on("message:video", async (ctx) => {
    const video = ctx.message.video;
    await ctx.reply(
      `Video received!\n` +
        `Duration: ${video.duration}s\n` +
        `Resolution: ${video.width}x${video.height}`
    );
  });

  bot.on("message:audio", async (ctx) => {
    const audio = ctx.message.audio;
    await ctx.reply(
      `Audio received!\n` +
        `Duration: ${audio.duration}s\n` +
        `Title: ${audio.title ?? "Unknown"}\n` +
        `Artist: ${audio.performer ?? "Unknown"}`
    );
  });

  bot.on("message:voice", async (ctx) => {
    const voice = ctx.message.voice;
    await ctx.reply(`Voice message received! Duration: ${voice.duration}s`);
  });

  bot.on("message:video_note", async (ctx) => {
    const videoNote = ctx.message.video_note;
    await ctx.reply(`Video note received! Duration: ${videoNote.duration}s`);
  });

  bot.on("message:sticker", async (ctx) => {
    const sticker = ctx.message.sticker;
    await ctx.reply(
      `Sticker received!\n` +
        `Emoji: ${sticker.emoji ?? "None"}\n` +
        `Set: ${sticker.set_name ?? "None"}`
    );
  });

  bot.on("message:location", async (ctx) => {
    const loc = ctx.message.location;
    await ctx.reply(`Location received!\nLat: ${loc.latitude}\nLon: ${loc.longitude}`);
  });

  bot.on("message:contact", async (ctx) => {
    const contact = ctx.message.contact;
    await ctx.reply(
      `Contact received!\n` +
        `Name: ${contact.first_name} ${contact.last_name ?? ""}\n` +
        `Phone: ${contact.phone_number}`
    );
  });

  bot.on("message:venue", async (ctx) => {
    const venue = ctx.message.venue;
    await ctx.reply(`Venue received!\nName: ${venue.title}\nAddress: ${venue.address}`);
  });

  // ============================================================
  // POLLS
  // ============================================================

  bot.command("poll", async (ctx) => {
    ctx.session.commandCount++;
    await ctx.replyWithPoll("What's your favorite programming language?", [
      "TypeScript",
      "JavaScript",
      "Python",
      "Rust",
      "Go",
    ]);
  });

  bot.command("quiz", async (ctx) => {
    ctx.session.commandCount++;
    await ctx.replyWithPoll(
      "What does grammY stand for?",
      ["Grammy Awards", "Telegram Framework", "Grammar Check", "Graphics Library"],
      {
        type: "quiz",
        correct_option_id: 1,
        explanation: "grammY is a Telegram Bot framework for TypeScript/JavaScript!",
      }
    );
  });

  bot.on("poll_answer", async (ctx) => {
    const answer = ctx.pollAnswer;
    const user = answer.user;
    if (user && answer.option_ids.length > 0) {
      // Could send a message to the user or log the answer
      console.log(`User ${user.first_name} voted: option ${answer.option_ids[0]}`);
    }
  });

  // ============================================================
  // ADMIN COMMANDS (Groups Only)
  // ============================================================

  // Helper to check admin status
  async function isAdmin(ctx: MyContext): Promise<boolean> {
    if (!ctx.chat || ctx.chat.type === "private") return false;
    try {
      const member = await ctx.getChatMember(ctx.from!.id);
      return member.status === "administrator" || member.status === "creator";
    } catch {
      return false;
    }
  }

  async function isOwner(ctx: MyContext): Promise<boolean> {
    if (!ctx.chat || ctx.chat.type === "private") return false;
    try {
      const member = await ctx.getChatMember(ctx.from!.id);
      return member.status === "creator";
    } catch {
      return false;
    }
  }

  bot.command("ban", async (ctx) => {
    ctx.session.commandCount++;
    if (!(await isAdmin(ctx))) {
      return ctx.reply("This command is for group admins only.");
    }
    const targetId = ctx.message?.reply_to_message?.from?.id;
    if (!targetId) {
      return ctx.reply("Reply to a user's message to ban them.");
    }
    try {
      await ctx.banChatMember(targetId);
      await ctx.reply("User has been banned.");
    } catch (e) {
      await ctx.reply(`Failed to ban: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  });

  bot.command("kick", async (ctx) => {
    ctx.session.commandCount++;
    if (!(await isAdmin(ctx))) {
      return ctx.reply("This command is for group admins only.");
    }
    const targetId = ctx.message?.reply_to_message?.from?.id;
    if (!targetId) {
      return ctx.reply("Reply to a user's message to kick them.");
    }
    try {
      await ctx.banChatMember(targetId);
      await ctx.unbanChatMember(targetId);
      await ctx.reply("User has been kicked.");
    } catch (e) {
      await ctx.reply(`Failed to kick: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  });

  bot.command("mute", async (ctx) => {
    ctx.session.commandCount++;
    if (!(await isAdmin(ctx))) {
      return ctx.reply("This command is for group admins only.");
    }
    const targetId = ctx.message?.reply_to_message?.from?.id;
    if (!targetId) {
      return ctx.reply("Reply to a user's message to mute them.");
    }
    const duration = parseInt(ctx.match || "3600", 10);
    try {
      await ctx.restrictChatMember(targetId, {
        permissions: { can_send_messages: false },
        until_date: Math.floor(Date.now() / 1000) + duration,
      });
      await ctx.reply(`User muted for ${duration} seconds.`);
    } catch (e) {
      await ctx.reply(`Failed to mute: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  });

  bot.command("unmute", async (ctx) => {
    ctx.session.commandCount++;
    if (!(await isAdmin(ctx))) {
      return ctx.reply("This command is for group admins only.");
    }
    const targetId = ctx.message?.reply_to_message?.from?.id;
    if (!targetId) {
      return ctx.reply("Reply to a user's message to unmute them.");
    }
    try {
      await ctx.restrictChatMember(targetId, {
        permissions: {
          can_send_messages: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
        },
      });
      await ctx.reply("User unmuted.");
    } catch (e) {
      await ctx.reply(`Failed to unmute: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  });

  bot.command("promote", async (ctx) => {
    ctx.session.commandCount++;
    if (!(await isOwner(ctx))) {
      return ctx.reply("This command is for the group owner only.");
    }
    const targetId = ctx.message?.reply_to_message?.from?.id;
    if (!targetId) {
      return ctx.reply("Reply to a user's message to promote them.");
    }
    try {
      await ctx.promoteChatMember(targetId, {
        can_delete_messages: true,
        can_restrict_members: true,
        can_pin_messages: true,
        can_manage_topics: true,
      });
      await ctx.reply("User promoted to admin.");
    } catch (e) {
      await ctx.reply(`Failed to promote: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  });

  bot.command("demote", async (ctx) => {
    ctx.session.commandCount++;
    if (!(await isOwner(ctx))) {
      return ctx.reply("This command is for the group owner only.");
    }
    const targetId = ctx.message?.reply_to_message?.from?.id;
    if (!targetId) {
      return ctx.reply("Reply to a user's message to demote them.");
    }
    try {
      await ctx.promoteChatMember(targetId, {
        can_delete_messages: false,
        can_restrict_members: false,
        can_pin_messages: false,
        can_manage_topics: false,
      });
      await ctx.reply("Admin demoted to member.");
    } catch (e) {
      await ctx.reply(`Failed to demote: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  });

  // ============================================================
  // CHAT SETTINGS
  // ============================================================

  bot.command("slowmode", async (ctx) => {
    ctx.session.commandCount++;
    if (!(await isAdmin(ctx))) {
      return ctx.reply("This command is for group admins only.");
    }
    const delay = parseInt(ctx.match || "30", 10);
    try {
      await ctx.api.setChatSlowModeDelay(ctx.chat!.id, delay);
      await ctx.reply(`Slow mode set to ${delay} seconds.`);
    } catch (e) {
      await ctx.reply(`Failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  });

  bot.command("lock", async (ctx) => {
    ctx.session.commandCount++;
    if (!(await isAdmin(ctx))) {
      return ctx.reply("This command is for group admins only.");
    }
    try {
      await ctx.setChatPermissions({ can_send_messages: false });
      await ctx.reply("Chat locked. Only admins can send messages.");
    } catch (e) {
      await ctx.reply(`Failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  });

  bot.command("unlock", async (ctx) => {
    ctx.session.commandCount++;
    if (!(await isAdmin(ctx))) {
      return ctx.reply("This command is for group admins only.");
    }
    try {
      await ctx.setChatPermissions({
        can_send_messages: true,
        can_send_audios: true,
        can_send_documents: true,
        can_send_photos: true,
        can_send_videos: true,
        can_send_video_notes: true,
        can_send_voice_notes: true,
        can_send_polls: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
      });
      await ctx.reply("Chat unlocked.");
    } catch (e) {
      await ctx.reply(`Failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  });

  bot.command("invite", async (ctx) => {
    ctx.session.commandCount++;
    if (!(await isAdmin(ctx))) {
      return ctx.reply("This command is for group admins only.");
    }
    try {
      const link = await ctx.createChatInviteLink({
        name: "Public Invite",
        member_limit: 100,
        expire_date: Math.floor(Date.now() / 1000) + 86400 * 7, // 7 days
      });
      await ctx.reply(`Invite link: ${link.invite_link}\n\nExpires in 7 days, max 100 uses.`);
    } catch (e) {
      await ctx.reply(`Failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  });

  bot.command("pin", async (ctx) => {
    ctx.session.commandCount++;
    if (!(await isAdmin(ctx))) {
      return ctx.reply("This command is for group admins only.");
    }
    if (!ctx.message?.reply_to_message) {
      return ctx.reply("Reply to a message to pin it.");
    }
    try {
      await ctx.pinChatMessage(ctx.message.reply_to_message.message_id);
      await ctx.reply("Message pinned.");
    } catch (e) {
      await ctx.reply(`Failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  });

  // ============================================================
  // FORUM TOPICS
  // ============================================================

  bot.command("topic", async (ctx) => {
    ctx.session.commandCount++;
    if (!(await isAdmin(ctx))) {
      return ctx.reply("This command is for group admins only.");
    }
    const name = ctx.match || "New Topic";
    try {
      const topic = await ctx.createForumTopic(name);
      await ctx.reply(`Forum topic "${topic.name}" created! ID: ${topic.message_thread_id}`);
    } catch (e) {
      await ctx.reply(`Failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  });

  bot.command("closetopic", async (ctx) => {
    ctx.session.commandCount++;
    if (!(await isAdmin(ctx))) {
      return ctx.reply("This command is for group admins only.");
    }
    const threadId = ctx.message?.message_thread_id;
    if (!threadId) {
      return ctx.reply("Use this command inside a topic to close it.");
    }
    try {
      await ctx.closeForumTopic(threadId);
      await ctx.reply("Topic closed.");
    } catch (e) {
      await ctx.reply(`Failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  });

  bot.command("reopentopic", async (ctx) => {
    ctx.session.commandCount++;
    if (!(await isAdmin(ctx))) {
      return ctx.reply("This command is for group admins only.");
    }
    const threadId = ctx.message?.message_thread_id;
    if (!threadId) {
      return ctx.reply("Use this command inside a topic to reopen it.");
    }
    try {
      await ctx.reopenForumTopic(threadId);
      await ctx.reply("Topic reopened.");
    } catch (e) {
      await ctx.reply(`Failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  });

  // ============================================================
  // REACTIONS
  // ============================================================

  bot.on("message_reaction", async (ctx) => {
    const reaction = ctx.messageReaction!;
    const newReactions = reaction.new_reaction;

    // React to likes
    if (newReactions.some((r) => r.type === "emoji" && r.emoji === "👍")) {
      try {
        await ctx.api.sendMessage(reaction.chat.id, "Thanks for the like!", {
          reply_to_message_id: reaction.message_id,
        });
      } catch {
        // Ignore errors (message might be deleted)
      }
    }
  });

  // ============================================================
  // INLINE QUERIES
  // ============================================================

  bot.on("inline_query", async (ctx) => {
    const query = ctx.inlineQuery.query.toLowerCase();

    const results = [
      {
        type: "article" as const,
        id: "1",
        title: "Say Hello",
        description: "Send a greeting message",
        input_message_content: { message_text: `Hello! ${query ? `You searched: ${query}` : ""}` },
      },
      {
        type: "article" as const,
        id: "2",
        title: "Share Bot",
        description: "Share this bot with friends",
        input_message_content: {
          message_text: "Check out this awesome bot! @" + ctx.me.username,
        },
      },
      {
        type: "article" as const,
        id: "3",
        title: "Current Time",
        description: "Send the current time",
        input_message_content: {
          message_text: `Current time: ${new Date().toLocaleString()}`,
        },
      },
    ];

    // Filter results based on query
    const filtered = query
      ? results.filter(
          (r) =>
            r.title.toLowerCase().includes(query) ||
            r.description.toLowerCase().includes(query)
        )
      : results;

    await ctx.answerInlineQuery(filtered, {
      cache_time: 10,
      is_personal: true,
    });
  });

  bot.on("chosen_inline_result", async (ctx) => {
    const result = ctx.chosenInlineResult;
    console.log(`User ${result.from.first_name} chose inline result: ${result.result_id}`);
  });

  // ============================================================
  // PAYMENTS
  // ============================================================

  bot.command("buy", async (ctx) => {
    ctx.session.commandCount++;
    await ctx.replyWithInvoice(
      "Premium Subscription",
      "Get 30 days of premium features including unlimited usage and priority support.",
      "premium_30_days",
      "XTR", // Telegram Stars
      [{ label: "Premium (30 days)", amount: 100 }],
      {
        photo_url: "https://grammy.dev/images/grammY.png",
        photo_width: 512,
        photo_height: 512,
      }
    );
  });

  bot.on("pre_checkout_query", async (ctx) => {
    // Validate the order before accepting payment
    const query = ctx.preCheckoutQuery;

    // You could check inventory, validate payload, etc.
    if (query.invoice_payload === "premium_30_days") {
      await ctx.answerPreCheckoutQuery(true);
    } else {
      await ctx.answerPreCheckoutQuery(false, "Invalid product");
    }
  });

  bot.on("message:successful_payment", async (ctx) => {
    const payment = ctx.message.successful_payment!;
    await ctx.reply(
      `Payment received!\n\n` +
        `Amount: ${payment.total_amount} ${payment.currency}\n` +
        `Thank you for your purchase! Your premium features are now active.`
    );
  });

  // ============================================================
  // CHAT MEMBER UPDATES
  // ============================================================

  bot.on("chat_member", async (ctx) => {
    const update = ctx.chatMember!;
    const oldStatus = update.old_chat_member.status;
    const newStatus = update.new_chat_member.status;
    const user = update.new_chat_member.user;

    // User joined
    if (
      (oldStatus === "left" || oldStatus === "kicked") &&
      (newStatus === "member" || newStatus === "administrator")
    ) {
      await ctx.api.sendMessage(
        update.chat.id,
        `Welcome to the group, ${user.first_name}!`
      );
    }

    // User left
    if (
      (oldStatus === "member" || oldStatus === "administrator") &&
      (newStatus === "left" || newStatus === "kicked")
    ) {
      await ctx.api.sendMessage(update.chat.id, `Goodbye, ${user.first_name}!`);
    }
  });

  bot.on("chat_join_request", async (ctx) => {
    const request = ctx.chatJoinRequest!;
    // Auto-approve join requests (you might want to add verification)
    try {
      await ctx.approveChatJoinRequest(request.from.id);
      await ctx.api.sendMessage(
        request.from.id,
        `Your request to join "${request.chat.title}" has been approved!`
      );
    } catch {
      // User might have blocked the bot
    }
  });

  // ============================================================
  // DEFAULT TEXT HANDLER
  // ============================================================

  bot.on("message:text", async (ctx) => {
    // Don't respond to commands or keyboard buttons
    const text = ctx.message.text;
    if (
      text.startsWith("/") ||
      ["Help", "Stats", "Settings", "Cancel"].includes(text)
    ) {
      return;
    }

    // Echo with some formatting
    await ctx.reply(`You said: _${text}_`, { parse_mode: "Markdown" });
  });

  // ============================================================
  // ERROR HANDLING
  // ============================================================

  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id}:`);

    const e = err.error;
    if (e instanceof GrammyError) {
      console.error("Error in request:", e.description);
    } else if (e instanceof HttpError) {
      console.error("Could not contact Telegram:", e);
    } else {
      console.error("Unknown error:", e);
    }
  });

  return bot;
}

