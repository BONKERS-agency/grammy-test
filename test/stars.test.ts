import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestBot } from "../src/index.js";

describe("Stars Transactions", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("star transaction tracking", () => {
    it("should create a star transaction", async () => {
      const user = testBot.createUser({ first_name: "Buyer" });

      const transaction = testBot.server.paymentState.createTransaction(testBot.botInfo.id, 100, {
        sourceUser: user,
      });

      expect(transaction.id).toBeDefined();
      expect(transaction.amount).toBe(100);
      expect(transaction.source?.user.id).toBe(user.id);
      expect(transaction.refunded).toBe(false);
    });

    it("should track multiple transactions", async () => {
      const user1 = testBot.createUser({ first_name: "Buyer1" });
      const user2 = testBot.createUser({ first_name: "Buyer2" });

      testBot.server.paymentState.createTransaction(testBot.botInfo.id, 50, { sourceUser: user1 });
      testBot.server.paymentState.createTransaction(testBot.botInfo.id, 100, { sourceUser: user2 });
      testBot.server.paymentState.createTransaction(testBot.botInfo.id, 75, { sourceUser: user1 });

      const transactions = testBot.server.paymentState.getStarTransactions(testBot.botInfo.id);

      expect(transactions.transactions).toHaveLength(3);
    });

    it("should return transactions (all created in same test run)", async () => {
      const user = testBot.createUser({ first_name: "Buyer" });

      testBot.server.paymentState.createTransaction(testBot.botInfo.id, 50, { sourceUser: user });
      testBot.server.paymentState.createTransaction(testBot.botInfo.id, 100, { sourceUser: user });
      testBot.server.paymentState.createTransaction(testBot.botInfo.id, 75, { sourceUser: user });

      const transactions = testBot.server.paymentState.getStarTransactions(testBot.botInfo.id);
      const amounts = transactions.transactions.map((t) => t.amount);

      // Verify all transactions are returned (order may vary if same timestamp)
      expect(amounts).toHaveLength(3);
      expect(amounts).toContain(50);
      expect(amounts).toContain(100);
      expect(amounts).toContain(75);
    });
  });

  describe("getStarTransactions API", () => {
    it("should get star transactions through API", async () => {
      const buyer = testBot.createUser({ first_name: "Buyer" });

      // Create some transactions
      testBot.server.paymentState.createTransaction(testBot.botInfo.id, 100, { sourceUser: buyer });
      testBot.server.paymentState.createTransaction(testBot.botInfo.id, 200, { sourceUser: buyer });

      testBot.command("transactions", async (ctx) => {
        const result = await ctx.api.getStarTransactions();
        await ctx.reply(`Transactions: ${result.transactions.length}`);
      });

      const user = testBot.createUser({ first_name: "Admin" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/transactions");
      expect(response.text).toBe("Transactions: 2");
    });

    it("should support offset and limit", async () => {
      const buyer = testBot.createUser({ first_name: "Buyer" });

      // Create 5 transactions
      for (let i = 0; i < 5; i++) {
        testBot.server.paymentState.createTransaction(testBot.botInfo.id, (i + 1) * 10, {
          sourceUser: buyer,
        });
      }

      testBot.command("transactions", async (ctx) => {
        const result = await ctx.api.getStarTransactions({ offset: 1, limit: 2 });
        await ctx.reply(`Got: ${result.transactions.length}`);
      });

      const user = testBot.createUser({ first_name: "Admin" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/transactions");
      expect(response.text).toBe("Got: 2");
    });
  });

  describe("star refunds", () => {
    it("should refund a star payment", async () => {
      const buyer = testBot.createUser({ first_name: "Buyer" });

      const transaction = testBot.server.paymentState.createTransaction(testBot.botInfo.id, 100, {
        sourceUser: buyer,
      });

      expect(transaction.telegram_payment_charge_id).toBeDefined();
      const chargeId = transaction.telegram_payment_charge_id ?? "";

      // Refund the transaction
      const refunded = testBot.server.paymentState.refundStarPayment(testBot.botInfo.id, chargeId);

      expect(refunded).toBe(true);
      expect(transaction.refunded).toBe(true);
      expect(testBot.server.paymentState.isRefunded(transaction.id)).toBe(true);
    });

    it("should not refund same transaction twice", async () => {
      const buyer = testBot.createUser({ first_name: "Buyer" });

      const transaction = testBot.server.paymentState.createTransaction(testBot.botInfo.id, 100, {
        sourceUser: buyer,
      });

      expect(transaction.telegram_payment_charge_id).toBeDefined();
      const chargeId = transaction.telegram_payment_charge_id ?? "";

      const firstRefund = testBot.server.paymentState.refundStarPayment(
        testBot.botInfo.id,
        chargeId,
      );
      const secondRefund = testBot.server.paymentState.refundStarPayment(
        testBot.botInfo.id,
        chargeId,
      );

      expect(firstRefund).toBe(true);
      expect(secondRefund).toBe(false);
    });

    it("should refund via API", async () => {
      const buyer = testBot.createUser({ first_name: "Buyer" });

      const transaction = testBot.server.paymentState.createTransaction(testBot.botInfo.id, 100, {
        sourceUser: buyer,
      });

      const chargeId = transaction.telegram_payment_charge_id ?? "";

      testBot.command("refund", async (ctx) => {
        await ctx.api.refundStarPayment(testBot.botInfo.id, chargeId);
        await ctx.reply("Refunded");
      });

      const user = testBot.createUser({ first_name: "Admin" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/refund");
      expect(response.text).toBe("Refunded");
      expect(testBot.server.paymentState.isRefunded(transaction.id)).toBe(true);
    });
  });

  describe("star balance", () => {
    it("should calculate star balance", async () => {
      const buyer = testBot.createUser({ first_name: "Buyer" });

      testBot.server.paymentState.createTransaction(testBot.botInfo.id, 100, { sourceUser: buyer });
      testBot.server.paymentState.createTransaction(testBot.botInfo.id, 200, { sourceUser: buyer });

      const balance = testBot.server.paymentState.getStarBalance(testBot.botInfo.id);
      expect(balance).toBe(300);
    });

    it("should exclude refunded transactions from balance", async () => {
      const buyer = testBot.createUser({ first_name: "Buyer" });

      const tx1 = testBot.server.paymentState.createTransaction(testBot.botInfo.id, 100, {
        sourceUser: buyer,
      });
      testBot.server.paymentState.createTransaction(testBot.botInfo.id, 200, { sourceUser: buyer });

      // Refund first transaction
      expect(tx1.telegram_payment_charge_id).toBeDefined();
      testBot.server.paymentState.refundStarPayment(
        testBot.botInfo.id,
        tx1.telegram_payment_charge_id ?? "",
      );

      const balance = testBot.server.paymentState.getStarBalance(testBot.botInfo.id);
      expect(balance).toBe(200); // Only second transaction counts
    });
  });

  describe("transaction lookup", () => {
    it("should get transaction by ID", async () => {
      const buyer = testBot.createUser({ first_name: "Buyer" });

      const transaction = testBot.server.paymentState.createTransaction(testBot.botInfo.id, 100, {
        sourceUser: buyer,
      });

      const found = testBot.server.paymentState.getTransaction(testBot.botInfo.id, transaction.id);
      expect(found).toBeDefined();
      expect(found?.amount).toBe(100);
    });

    it("should get transaction by charge ID", async () => {
      const buyer = testBot.createUser({ first_name: "Buyer" });

      const transaction = testBot.server.paymentState.createTransaction(testBot.botInfo.id, 150, {
        sourceUser: buyer,
      });

      expect(transaction.telegram_payment_charge_id).toBeDefined();
      const found = testBot.server.paymentState.getTransactionByChargeId(
        testBot.botInfo.id,
        transaction.telegram_payment_charge_id ?? "",
      );

      expect(found).toBeDefined();
      expect(found?.amount).toBe(150);
    });
  });
});
