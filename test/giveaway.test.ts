import type { Chat, Message, User } from "grammy/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestBot } from "../src/index.js";

// Extended message types for giveaway features
type GiveawayMessage = Message & {
  giveaway?: {
    chats: Chat[];
    winners_selection_date: number;
    winner_count: number;
    only_new_members?: boolean;
    prize_description?: string;
    country_codes?: string[];
    premium_subscription_month_count?: number;
  };
};

type GiveawayCompletedMessage = Message & {
  giveaway_completed?: {
    winner_count: number;
    unclaimed_prize_count?: number;
    giveaway_message?: { message_id: number; chat: Chat; date: number };
    was_refunded?: boolean;
  };
};

type GiveawayWinnersMessage = Message & {
  giveaway_winners?: {
    chat: Chat;
    giveaway_message_id: number;
    winners_selection_date: number;
    winner_count: number;
    winners: User[];
    prize_description?: string;
  };
};

describe("Giveaway Support", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("giveaway simulation", () => {
    it("should simulate a giveaway message", async () => {
      const channel = testBot.createChat({ type: "channel", title: "Test Channel" });

      const update = testBot.server.simulateGiveaway(channel, {
        winnerCount: 3,
        prizeDescription: "Premium subscription",
      });

      expect(update.message).toBeDefined();
      const msg = update.message as GiveawayMessage;
      expect(msg.giveaway).toBeDefined();
      expect(msg.giveaway?.winner_count).toBe(3);
      expect(msg.giveaway?.prize_description).toBe("Premium subscription");
    });

    it("should simulate giveaway with multiple chats", async () => {
      const channel1 = testBot.createChat({ type: "channel", title: "Channel 1" });
      const channel2 = testBot.createChat({ type: "channel", title: "Channel 2" });

      const update = testBot.server.simulateGiveaway(channel1, {
        chats: [channel1, channel2],
        winnerCount: 5,
      });

      expect((update.message as GiveawayMessage).giveaway?.chats).toHaveLength(2);
    });

    it("should simulate giveaway with country restrictions", async () => {
      const channel = testBot.createChat({ type: "channel", title: "Test Channel" });

      const update = testBot.server.simulateGiveaway(channel, {
        countryCodes: ["US", "CA", "GB"],
        onlyNewMembers: true,
      });

      const msg = update.message as GiveawayMessage;
      expect(msg.giveaway?.country_codes).toEqual(["US", "CA", "GB"]);
      expect(msg.giveaway?.only_new_members).toBe(true);
    });

    it("should simulate premium giveaway", async () => {
      const channel = testBot.createChat({ type: "channel", title: "Test Channel" });

      const update = testBot.server.simulateGiveaway(channel, {
        premiumSubscriptionMonthCount: 12,
        winnerCount: 10,
      });

      expect((update.message as GiveawayMessage).giveaway?.premium_subscription_month_count).toBe(
        12,
      );
    });
  });

  describe("giveaway handling", () => {
    it("should handle giveaway messages", async () => {
      let receivedGiveaway = false;

      testBot.on("message", async (ctx) => {
        if ((ctx.msg as GiveawayMessage).giveaway) {
          receivedGiveaway = true;
        }
      });

      const channel = testBot.createChat({ type: "channel", title: "Test Channel" });
      const update = testBot.server.simulateGiveaway(channel);

      await testBot.handleUpdate(update);

      expect(receivedGiveaway).toBe(true);
    });
  });

  describe("giveaway completion", () => {
    it("should simulate giveaway completion", async () => {
      const channel = testBot.createChat({ type: "channel", title: "Test Channel" });
      const winner = testBot.createUser({ first_name: "Winner" });

      const giveawayUpdate = testBot.server.simulateGiveaway(channel);
      const giveawayMessageId = giveawayUpdate.message?.message_id ?? 0;

      const completionUpdate = testBot.server.simulateGiveawayCompleted(
        channel,
        giveawayMessageId,
        [winner],
      );

      expect(completionUpdate.message).toBeDefined();
      const completedMsg = completionUpdate.message as GiveawayCompletedMessage;
      expect(completedMsg.giveaway_completed).toBeDefined();
      expect(completedMsg.giveaway_completed?.winner_count).toBe(1);
    });

    it("should track unclaimed prizes", async () => {
      const channel = testBot.createChat({ type: "channel", title: "Test Channel" });
      const winner = testBot.createUser({ first_name: "Winner" });

      const giveawayUpdate = testBot.server.simulateGiveaway(channel, { winnerCount: 3 });
      const giveawayMessageId = giveawayUpdate.message?.message_id ?? 0;

      const completionUpdate = testBot.server.simulateGiveawayCompleted(
        channel,
        giveawayMessageId,
        [winner],
        { unclaimedPrizeCount: 2 },
      );

      const completedMsg = completionUpdate.message as GiveawayCompletedMessage;
      expect(completedMsg.giveaway_completed?.unclaimed_prize_count).toBe(2);
    });

    it("should handle refunded giveaway", async () => {
      const channel = testBot.createChat({ type: "channel", title: "Test Channel" });

      const giveawayUpdate = testBot.server.simulateGiveaway(channel);
      const giveawayMessageId = giveawayUpdate.message?.message_id ?? 0;

      const completionUpdate = testBot.server.simulateGiveawayCompleted(
        channel,
        giveawayMessageId,
        [],
        { wasRefunded: true },
      );

      const completedMsg = completionUpdate.message as GiveawayCompletedMessage;
      expect(completedMsg.giveaway_completed?.was_refunded).toBe(true);
    });
  });

  describe("giveaway winners", () => {
    it("should simulate giveaway winners announcement", async () => {
      const channel = testBot.createChat({ type: "channel", title: "Test Channel" });
      const winner1 = testBot.createUser({ first_name: "Winner1" });
      const winner2 = testBot.createUser({ first_name: "Winner2" });

      const giveawayUpdate = testBot.server.simulateGiveaway(channel);
      const giveawayMessageId = giveawayUpdate.message?.message_id ?? 0;

      const winnersUpdate = testBot.server.simulateGiveawayWinners(
        channel,
        giveawayMessageId,
        [winner1, winner2],
        { prizeDescription: "1 month Premium" },
      );

      const winnersMsg = winnersUpdate.message as GiveawayWinnersMessage;
      expect(winnersMsg.giveaway_winners).toBeDefined();
      expect(winnersMsg.giveaway_winners?.winners).toHaveLength(2);
      expect(winnersMsg.giveaway_winners?.prize_description).toBe("1 month Premium");
    });
  });
});
