import type { Message, PassportElementError } from "grammy/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestBot } from "../src/index.js";

// Extended message type for passport data
type PassportDataMessage = Message & {
  passport_data?: {
    data: Array<{ type: string }>;
    credentials?: { secret?: string };
  };
};

describe("Passport Support", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("passport data simulation", () => {
    it("should simulate passport data being submitted", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      const update = testBot.server.simulatePassportData(user, chat, {
        personal_details: {
          first_name: "John",
          last_name: "Doe",
          birth_date: "1990-01-15",
          gender: "male",
          country_code: "US",
        },
      });

      expect(update.message).toBeDefined();
      const msg = update.message as PassportDataMessage;
      expect(msg.passport_data).toBeDefined();
      expect(msg.passport_data?.data).toHaveLength(1);
      expect(msg.passport_data?.data[0].type).toBe("personal_details");
    });

    it("should simulate multiple passport elements", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      const update = testBot.server.simulatePassportData(user, chat, {
        personal_details: { first_name: "John" },
        address: { street_line1: "123 Main St", city: "NYC" },
        passport: { document_no: "AB123456" },
      });

      expect((update.message as PassportDataMessage).passport_data?.data).toHaveLength(3);
    });

    it("should include credentials in passport data", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      const update = testBot.server.simulatePassportData(
        user,
        chat,
        { personal_details: { first_name: "John" } },
        { nonce: "unique_nonce_123" },
      );

      const msg = update.message as PassportDataMessage;
      expect(msg.passport_data?.credentials).toBeDefined();
      expect(msg.passport_data?.credentials?.secret).toBeDefined();
    });
  });

  describe("passport data handling", () => {
    it("should handle passport data messages", async () => {
      let receivedPassportData = false;

      testBot.on("message", async (ctx) => {
        if ((ctx.msg as PassportDataMessage).passport_data) {
          receivedPassportData = true;
        }
      });

      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      const update = testBot.server.simulatePassportData(user, chat, {
        email: "user@example.com",
      });

      await testBot.handleUpdate(update);

      expect(receivedPassportData).toBe(true);
    });
  });

  describe("setPassportDataErrors API", () => {
    it("should set passport data errors", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      // First submit some passport data
      testBot.server.simulatePassportData(user, chat, {
        personal_details: { first_name: "John" },
      });

      testBot.command("reject", async (ctx) => {
        await ctx.api.setPassportDataErrors(user.id, [
          {
            source: "data",
            type: "personal_details",
            field_name: "first_name",
            data_hash: "abc123",
            message: "Name contains invalid characters",
          },
        ]);
        await ctx.reply("Errors set");
      });

      const response = await testBot.sendCommand(user, chat, "/reject");
      expect(response.text).toBe("Errors set");

      // Verify errors were stored
      const errors = testBot.server.passportState.getPassportDataErrors(user.id);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe("Name contains invalid characters");
    });

    it("should set multiple errors", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      testBot.command("reject", async (ctx) => {
        await ctx.api.setPassportDataErrors(user.id, [
          {
            source: "data",
            type: "personal_details",
            field_name: "first_name",
            data_hash: "abc123",
            message: "Invalid name",
          },
          {
            source: "front_side",
            type: "passport",
            file_hash: "def456",
            message: "Photo is blurry",
          },
        ]);
        await ctx.reply("Errors set");
      });

      await testBot.sendCommand(user, chat, "/reject");

      const errors = testBot.server.passportState.getPassportDataErrors(user.id);
      expect(errors).toHaveLength(2);
    });
  });

  describe("passport state management", () => {
    it("should track passport data per user", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      testBot.server.simulatePassportData(user, chat, {
        email: "user@example.com",
      });

      expect(testBot.server.passportState.hasPassportData(user.id)).toBe(true);
      expect(testBot.server.passportState.getPassportData(user.id)?.data).toHaveProperty("email");
    });

    it("should clear passport data errors", async () => {
      const user = testBot.createUser({ first_name: "User" });

      testBot.server.passportState.setPassportDataErrors(user.id, [
        {
          source: "data",
          type: "email",
          message: "Invalid email",
          data_hash: "hash",
        } as PassportElementError,
      ]);

      expect(testBot.server.passportState.getPassportDataErrors(user.id)).toHaveLength(1);

      testBot.server.passportState.clearPassportDataErrors(user.id);

      expect(testBot.server.passportState.getPassportDataErrors(user.id)).toHaveLength(0);
    });

    it("should remove passport data", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      testBot.server.simulatePassportData(user, chat, { email: "test@example.com" });

      expect(testBot.server.passportState.hasPassportData(user.id)).toBe(true);

      testBot.server.passportState.removePassportData(user.id);

      expect(testBot.server.passportState.hasPassportData(user.id)).toBe(false);
    });
  });
});
