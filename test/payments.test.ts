import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestBot } from "../src/index.js";

describe("Payments", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("Send Invoice", () => {
    it("should send an invoice", async () => {
      const user = testBot.createUser({ first_name: "Alice" });
      const chat = testBot.createChat({ type: "private" });

      testBot.command("buy", async (ctx) => {
        await ctx.replyWithInvoice(
          "Premium Access",
          "30 days of premium features",
          "premium_30",
          "XTR",
          [{ label: "Premium Subscription", amount: 500 }]
        );
      });

      const response = await testBot.sendCommand(user, chat, "/buy");

      expect(response.invoice).toBeDefined();
      expect(response.invoice?.title).toBe("Premium Access");
      expect(response.invoice?.description).toBe("30 days of premium features");
      expect(response.invoice?.currency).toBe("XTR");
      expect(response.invoice?.total_amount).toBe(500);
    });

    it("should send invoice with photo", async () => {
      const user = testBot.createUser({ first_name: "Bob" });
      const chat = testBot.createChat({ type: "private" });

      testBot.command("product", async (ctx) => {
        await ctx.replyWithInvoice(
          "T-Shirt",
          "Cool branded t-shirt",
          "tshirt_001",
          "USD",
          [{ label: "T-Shirt", amount: 2500 }],
          {
            photo_url: "https://example.com/tshirt.jpg",
            photo_size: 1024,
            photo_width: 400,
            photo_height: 400,
          }
        );
      });

      const response = await testBot.sendCommand(user, chat, "/product");

      expect(response.invoice).toBeDefined();
      expect(response.invoice?.title).toBe("T-Shirt");
    });

    it("should send invoice with multiple prices", async () => {
      const user = testBot.createUser({ first_name: "Charlie" });
      const chat = testBot.createChat({ type: "private" });

      testBot.command("order", async (ctx) => {
        await ctx.replyWithInvoice("Order #123", "Your order summary", "order_123", "USD", [
          { label: "Item 1", amount: 1000 },
          { label: "Item 2", amount: 500 },
          { label: "Shipping", amount: 300 },
          { label: "Tax", amount: 180 },
        ]);
      });

      const response = await testBot.sendCommand(user, chat, "/order");

      expect(response.invoice).toBeDefined();
      expect(response.invoice?.total_amount).toBe(1980);
    });

    it("should support flexible shipping", async () => {
      const user = testBot.createUser({ first_name: "Dave" });
      const chat = testBot.createChat({ type: "private" });

      testBot.command("shop", async (ctx) => {
        await ctx.replyWithInvoice("Physical Item", "Requires shipping", "physical_001", "USD", [{ label: "Item", amount: 5000 }], {
          need_shipping_address: true,
          is_flexible: true,
        });
      });

      const response = await testBot.sendCommand(user, chat, "/shop");

      expect(response.invoice).toBeDefined();
    });
  });

  describe("Pre-Checkout Query", () => {
    it("should handle pre-checkout query approval", async () => {
      let preCheckoutHandled = false;

      testBot.on("pre_checkout_query", async (ctx) => {
        preCheckoutHandled = true;
        await ctx.answerPreCheckoutQuery(true);
      });

      const user = testBot.createUser({ first_name: "Eve" });
      const chat = testBot.createChat({ type: "private" });

      await testBot.simulatePreCheckout(user, {
        id: "precheckout_123",
        currency: "XTR",
        total_amount: 500,
        invoice_payload: "premium_30",
      });

      expect(preCheckoutHandled).toBe(true);
    });

    it("should handle pre-checkout query rejection", async () => {
      let rejectionReason: string | undefined;

      testBot.on("pre_checkout_query", async (ctx) => {
        const payload = ctx.preCheckoutQuery.invoice_payload;
        if (payload === "out_of_stock") {
          await ctx.answerPreCheckoutQuery(false, "Item is out of stock");
          rejectionReason = "Item is out of stock";
        } else {
          await ctx.answerPreCheckoutQuery(true);
        }
      });

      const user = testBot.createUser({ first_name: "Frank" });

      await testBot.simulatePreCheckout(user, {
        id: "precheckout_456",
        currency: "USD",
        total_amount: 2500,
        invoice_payload: "out_of_stock",
      });

      expect(rejectionReason).toBe("Item is out of stock");
    });

    it("should include order info in pre-checkout", async () => {
      let receivedOrderInfo: { name?: string; email?: string } | undefined;

      testBot.on("pre_checkout_query", async (ctx) => {
        receivedOrderInfo = {
          name: ctx.preCheckoutQuery.order_info?.name,
          email: ctx.preCheckoutQuery.order_info?.email,
        };
        await ctx.answerPreCheckoutQuery(true);
      });

      const user = testBot.createUser({ first_name: "Grace" });

      await testBot.simulatePreCheckout(user, {
        id: "precheckout_789",
        currency: "USD",
        total_amount: 1000,
        invoice_payload: "order_001",
        order_info: {
          name: "Grace Smith",
          email: "grace@example.com",
          phone_number: "+1234567890",
        },
      });

      expect(receivedOrderInfo?.name).toBe("Grace Smith");
      expect(receivedOrderInfo?.email).toBe("grace@example.com");
    });

    it("should include shipping address in pre-checkout", async () => {
      let receivedAddress: { city?: string; country_code?: string } | undefined;

      testBot.on("pre_checkout_query", async (ctx) => {
        const addr = ctx.preCheckoutQuery.order_info?.shipping_address;
        receivedAddress = {
          city: addr?.city,
          country_code: addr?.country_code,
        };
        await ctx.answerPreCheckoutQuery(true);
      });

      const user = testBot.createUser({ first_name: "Harry" });

      await testBot.simulatePreCheckout(user, {
        id: "precheckout_addr",
        currency: "USD",
        total_amount: 5000,
        invoice_payload: "physical_001",
        order_info: {
          shipping_address: {
            country_code: "US",
            state: "CA",
            city: "San Francisco",
            street_line1: "123 Main St",
            street_line2: "",
            post_code: "94102",
          },
        },
      });

      expect(receivedAddress?.city).toBe("San Francisco");
      expect(receivedAddress?.country_code).toBe("US");
    });
  });

  describe("Successful Payment", () => {
    it("should handle successful payment", async () => {
      let paymentReceived = false;
      let receivedAmount: number | undefined;

      testBot.on("message:successful_payment", async (ctx) => {
        paymentReceived = true;
        receivedAmount = ctx.message.successful_payment!.total_amount;
        await ctx.reply("Thank you for your purchase!");
      });

      const user = testBot.createUser({ first_name: "Ivy" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.simulateSuccessfulPayment(user, chat, {
        currency: "XTR",
        total_amount: 500,
        invoice_payload: "premium_30",
        telegram_payment_charge_id: "charge_123",
        provider_payment_charge_id: "provider_456",
      });

      expect(paymentReceived).toBe(true);
      expect(receivedAmount).toBe(500);
      expect(response.text).toBe("Thank you for your purchase!");
    });

    it("should include order info in successful payment", async () => {
      let customerEmail: string | undefined;

      testBot.on("message:successful_payment", async (ctx) => {
        customerEmail = ctx.message.successful_payment!.order_info?.email;
        await ctx.reply(`Receipt sent to ${customerEmail}`);
      });

      const user = testBot.createUser({ first_name: "Jack" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.simulateSuccessfulPayment(user, chat, {
        currency: "USD",
        total_amount: 2500,
        invoice_payload: "order_001",
        telegram_payment_charge_id: "charge_456",
        provider_payment_charge_id: "provider_789",
        order_info: {
          email: "jack@example.com",
        },
      });

      expect(customerEmail).toBe("jack@example.com");
      expect(response.text).toContain("jack@example.com");
    });

    it("should track payment in state", async () => {
      let receivedPayment: {
        currency: string;
        total_amount: number;
        invoice_payload: string;
        telegram_payment_charge_id: string;
      } | null = null;

      testBot.on("message:successful_payment", (ctx) => {
        receivedPayment = {
          currency: ctx.message.successful_payment!.currency,
          total_amount: ctx.message.successful_payment!.total_amount,
          invoice_payload: ctx.message.successful_payment!.invoice_payload,
          telegram_payment_charge_id: ctx.message.successful_payment!.telegram_payment_charge_id,
        };
        ctx.reply("Payment processed");
      });

      const user = testBot.createUser({ first_name: "Kate" });
      const chat = testBot.createChat({ type: "private" });

      await testBot.simulateSuccessfulPayment(user, chat, {
        currency: "XTR",
        total_amount: 1000,
        invoice_payload: "subscription_monthly",
        telegram_payment_charge_id: "charge_track_123",
        provider_payment_charge_id: "provider_track_456",
      });

      expect(receivedPayment).toBeDefined();
      expect(receivedPayment?.total_amount).toBe(1000);
      expect(receivedPayment?.invoice_payload).toBe("subscription_monthly");
      expect(receivedPayment?.telegram_payment_charge_id).toBe("charge_track_123");
    });
  });

  describe("Shipping Query", () => {
    it("should handle shipping query", async () => {
      let shippingQueryReceived = false;

      testBot.on("shipping_query", async (ctx) => {
        shippingQueryReceived = true;
        await ctx.answerShippingQuery(true, {
          shipping_options: [
            {
              id: "standard",
              title: "Standard Shipping",
              prices: [{ label: "Standard", amount: 500 }],
            },
            {
              id: "express",
              title: "Express Shipping",
              prices: [{ label: "Express", amount: 1500 }],
            },
          ],
        });
      });

      const user = testBot.createUser({ first_name: "Leo" });

      await testBot.simulateShippingQuery(user, {
        id: "shipping_123",
        invoice_payload: "physical_001",
        shipping_address: {
          country_code: "US",
          state: "NY",
          city: "New York",
          street_line1: "456 Broadway",
          street_line2: "",
          post_code: "10013",
        },
      });

      expect(shippingQueryReceived).toBe(true);
    });

    it("should reject shipping to unsupported region", async () => {
      let rejectionMessage: string | undefined;

      testBot.on("shipping_query", async (ctx) => {
        const country = ctx.shippingQuery.shipping_address.country_code;
        if (country !== "US") {
          await ctx.answerShippingQuery(false, { error_message: "We only ship to the United States" });
          rejectionMessage = "We only ship to the United States";
        } else {
          await ctx.answerShippingQuery(true, {
            shipping_options: [
              { id: "standard", title: "Standard", prices: [{ label: "Shipping", amount: 500 }] },
            ],
          });
        }
      });

      const user = testBot.createUser({ first_name: "Mike" });

      await testBot.simulateShippingQuery(user, {
        id: "shipping_456",
        invoice_payload: "physical_002",
        shipping_address: {
          country_code: "CA",
          state: "ON",
          city: "Toronto",
          street_line1: "789 King St",
          street_line2: "",
          post_code: "M5V 1M5",
        },
      });

      expect(rejectionMessage).toBe("We only ship to the United States");
    });
  });

  describe("Full Payment Flow", () => {
    it("should complete full payment flow", async () => {
      const events: string[] = [];

      testBot.command("buy", async (ctx) => {
        await ctx.replyWithInvoice("Test Product", "A test product", "test_001", "XTR", [{ label: "Product", amount: 100 }]);
        events.push("invoice_sent");
      });

      testBot.on("pre_checkout_query", async (ctx) => {
        events.push("pre_checkout");
        await ctx.answerPreCheckoutQuery(true);
      });

      testBot.on("message:successful_payment", async (ctx) => {
        events.push("payment_success");
        await ctx.reply("Thank you!");
      });

      const user = testBot.createUser({ first_name: "Nancy" });
      const chat = testBot.createChat({ type: "private" });

      // Step 1: Send invoice
      await testBot.sendCommand(user, chat, "/buy");

      // Step 2: Pre-checkout
      await testBot.simulatePreCheckout(user, {
        id: "flow_precheckout",
        currency: "XTR",
        total_amount: 100,
        invoice_payload: "test_001",
      });

      // Step 3: Successful payment
      await testBot.simulateSuccessfulPayment(user, chat, {
        currency: "XTR",
        total_amount: 100,
        invoice_payload: "test_001",
        telegram_payment_charge_id: "flow_charge",
        provider_payment_charge_id: "flow_provider",
      });

      expect(events).toEqual(["invoice_sent", "pre_checkout", "payment_success"]);
    });
  });

  describe("Refunds", () => {
    it("should handle refund request", async () => {
      // First complete a payment
      testBot.on("message:successful_payment", (ctx) => {
        ctx.reply("Payment received");
      });

      const user = testBot.createUser({ first_name: "Oscar" });
      const chat = testBot.createChat({ type: "private" });

      await testBot.simulateSuccessfulPayment(user, chat, {
        currency: "XTR",
        total_amount: 500,
        invoice_payload: "refundable_001",
        telegram_payment_charge_id: "refund_charge_123",
        provider_payment_charge_id: "refund_provider_456",
      });

      // Then process refund
      testBot.command("refund", async (ctx) => {
        await ctx.api.refundStarPayment(user.id, "refund_charge_123");
        await ctx.reply("Refund processed");
      });

      const refundResponse = await testBot.sendCommand(user, chat, "/refund");
      expect(refundResponse.text).toBe("Refund processed");

      // Check refund API was called
      const refundCalls = testBot.getApiCalls().filter((c) => c.method === "refundStarPayment");
      expect(refundCalls).toHaveLength(1);
      expect(refundCalls[0].payload.telegram_payment_charge_id).toBe("refund_charge_123");
    });
  });

  describe("Stars Currency", () => {
    it("should handle Telegram Stars (XTR) payments", async () => {
      let currencyReceived: string | undefined;

      testBot.on("message:successful_payment", async (ctx) => {
        currencyReceived = ctx.message.successful_payment!.currency;
        await ctx.reply("Stars payment received!");
      });

      const user = testBot.createUser({ first_name: "Paul" });
      const chat = testBot.createChat({ type: "private" });

      await testBot.simulateSuccessfulPayment(user, chat, {
        currency: "XTR",
        total_amount: 50,
        invoice_payload: "stars_item",
        telegram_payment_charge_id: "stars_123",
        provider_payment_charge_id: "stars_provider",
      });

      expect(currencyReceived).toBe("XTR");
    });
  });
});
