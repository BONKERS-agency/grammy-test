import type { MyContext, MyConversation } from "./types.js";

/**
 * Order conversation - multi-step pizza ordering flow
 */
export async function orderConversation(
  conversation: MyConversation,
  ctx: MyContext
): Promise<void> {
  await ctx.reply("Welcome to Pizza Bot! What size would you like?", {
    reply_markup: {
      keyboard: [[{ text: "Small" }, { text: "Medium" }, { text: "Large" }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });

  const sizeCtx = await conversation.waitFor("message:text");
  const size = sizeCtx.message.text;

  if (!["Small", "Medium", "Large"].includes(size)) {
    await ctx.reply("Invalid size. Order cancelled.");
    return;
  }

  await ctx.reply(`Great choice! ${size} pizza. What toppings?`, {
    reply_markup: {
      keyboard: [
        [{ text: "Pepperoni" }, { text: "Mushrooms" }],
        [{ text: "Hawaiian" }, { text: "Veggie" }],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });

  const toppingsCtx = await conversation.waitFor("message:text");
  const toppings = toppingsCtx.message.text;

  await ctx.reply(`Confirm your order?\n\nSize: ${size}\nToppings: ${toppings}`, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Confirm", callback_data: "order_confirm" },
          { text: "Cancel", callback_data: "order_cancel" },
        ],
      ],
    },
  });

  const confirmCtx = await conversation.waitForCallbackQuery([
    "order_confirm",
    "order_cancel",
  ]);

  if (confirmCtx.callbackQuery.data === "order_confirm") {
    await confirmCtx.answerCallbackQuery("Order placed!");
    await ctx.reply(
      `Order confirmed!\n\n${size} ${toppings} pizza is on its way!`,
      { reply_markup: { remove_keyboard: true } }
    );
  } else {
    await confirmCtx.answerCallbackQuery("Order cancelled");
    await ctx.reply("Order cancelled. Come back soon!", {
      reply_markup: { remove_keyboard: true },
    });
  }
}

/**
 * Age verification conversation with validation loop
 */
export async function verifyAgeConversation(
  conversation: MyConversation,
  ctx: MyContext
): Promise<void> {
  let age: number | null = null;
  let attempts = 0;
  const maxAttempts = 3;

  while (age === null && attempts < maxAttempts) {
    attempts++;
    await ctx.reply(
      `Please enter your age (must be 18 or older)${
        attempts > 1 ? ` - Attempt ${attempts}/${maxAttempts}` : ""
      }:`
    );

    const response = await conversation.waitFor("message:text");
    const input = response.message.text;

    // Allow cancellation
    if (input.toLowerCase() === "cancel") {
      await ctx.reply("Verification cancelled.");
      return;
    }

    const parsed = parseInt(input, 10);

    if (isNaN(parsed)) {
      await ctx.reply("That's not a valid number. Please enter your age as a number.");
    } else if (parsed < 0 || parsed > 150) {
      await ctx.reply("Please enter a realistic age.");
    } else if (parsed < 18) {
      await ctx.reply("Sorry, you must be 18 or older to continue.");
      return;
    } else {
      age = parsed;
    }
  }

  if (age === null) {
    await ctx.reply("Too many invalid attempts. Please try again later.");
    return;
  }

  await ctx.reply(`Age verified: ${age}. Welcome!`);
}

/**
 * Feedback conversation - collects user feedback
 */
export async function feedbackConversation(
  conversation: MyConversation,
  ctx: MyContext
): Promise<void> {
  await ctx.reply("How would you rate our service?", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "1", callback_data: "rate_1" },
          { text: "2", callback_data: "rate_2" },
          { text: "3", callback_data: "rate_3" },
          { text: "4", callback_data: "rate_4" },
          { text: "5", callback_data: "rate_5" },
        ],
      ],
    },
  });

  const ratingCtx = await conversation.waitForCallbackQuery([
    "rate_1",
    "rate_2",
    "rate_3",
    "rate_4",
    "rate_5",
  ]);

  const rating = parseInt(ratingCtx.callbackQuery.data!.split("_")[1], 10);
  await ratingCtx.answerCallbackQuery(`You rated ${rating}/5`);

  await ctx.reply("Would you like to leave a comment? (Type 'skip' to skip)");

  const commentCtx = await conversation.waitFor("message:text");
  const comment = commentCtx.message.text;

  if (comment.toLowerCase() === "skip") {
    await ctx.reply(`Thank you for your ${rating}-star rating!`);
  } else {
    await ctx.reply(
      `Thank you for your feedback!\n\nRating: ${"⭐".repeat(rating)}\nComment: ${comment}`
    );
  }
}

/**
 * Settings conversation - configure user preferences
 */
export async function settingsConversation(
  conversation: MyConversation,
  ctx: MyContext
): Promise<void> {
  const session = await conversation.external(() => ctx.session);

  await ctx.reply("Settings Menu", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: `Notifications: ${session.notifications ? "ON" : "OFF"}`,
            callback_data: "toggle_notifications",
          },
        ],
        [{ text: "Done", callback_data: "settings_done" }],
      ],
    },
  });

  while (true) {
    const actionCtx = await conversation.waitForCallbackQuery([
      "toggle_notifications",
      "settings_done",
    ]);

    if (actionCtx.callbackQuery.data === "settings_done") {
      await actionCtx.answerCallbackQuery("Settings saved!");
      await ctx.reply("Settings saved successfully.");
      return;
    }

    if (actionCtx.callbackQuery.data === "toggle_notifications") {
      await conversation.external(() => {
        ctx.session.notifications = !ctx.session.notifications;
      });
      const newValue = await conversation.external(() => ctx.session.notifications);

      await actionCtx.answerCallbackQuery(
        `Notifications ${newValue ? "enabled" : "disabled"}`
      );

      await actionCtx.editMessageReplyMarkup({
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `Notifications: ${newValue ? "ON" : "OFF"}`,
                callback_data: "toggle_notifications",
              },
            ],
            [{ text: "Done", callback_data: "settings_done" }],
          ],
        },
      });
    }
  }
}
