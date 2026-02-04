import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestBot } from "../src/index.js";

describe("Business Connections", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("business connection simulation", () => {
    it("should simulate a business connection", async () => {
      const businessUser = testBot.createUser({ first_name: "Business" });

      const update = testBot.server.simulateBusinessConnection(businessUser, 123456789, {
        canReply: true,
        isEnabled: true,
      });

      expect(update.business_connection).toBeDefined();
      expect(update.business_connection?.user.id).toBe(businessUser.id);
      expect(update.business_connection?.rights?.can_reply).toBe(true);
      expect(update.business_connection?.is_enabled).toBe(true);
    });

    it("should create connection with custom options", async () => {
      const businessUser = testBot.createUser({ first_name: "Business" });

      const update = testBot.server.simulateBusinessConnection(businessUser, 123456789, {
        canReply: false,
        isEnabled: false,
      });

      expect(update.business_connection?.rights).toBeUndefined(); // No rights = can't reply
      expect(update.business_connection?.is_enabled).toBe(false);
    });
  });

  describe("business connection handling", () => {
    it("should handle business_connection updates", async () => {
      let receivedConnection: unknown;

      testBot.on("business_connection", async (ctx) => {
        receivedConnection = ctx.businessConnection;
      });

      const businessUser = testBot.createUser({ first_name: "Business" });
      const update = testBot.server.simulateBusinessConnection(businessUser, 123456789);

      await testBot.handleUpdate(update);

      expect(receivedConnection).toBeDefined();
      expect((receivedConnection as { user: { id: number } }).user.id).toBe(businessUser.id);
    });
  });

  describe("business messages", () => {
    it("should simulate a business message", async () => {
      const businessUser = testBot.createUser({ first_name: "Business" });
      const chat = testBot.createChat({ type: "private" });

      // Create a business connection first
      const connectionUpdate = testBot.server.simulateBusinessConnection(businessUser, chat.id);
      const connectionId = connectionUpdate.business_connection?.id ?? "";

      // Simulate a business message
      const messageUpdate = testBot.server.simulateBusinessMessage(
        businessUser,
        chat,
        "Hello from business",
        connectionId,
      );

      expect(messageUpdate.business_message).toBeDefined();
      expect(messageUpdate.business_message?.text).toBe("Hello from business");
      expect(
        (messageUpdate.business_message as { business_connection_id?: string })
          ?.business_connection_id,
      ).toBe(connectionId);
    });

    it("should handle business_message updates", async () => {
      let receivedMessage: unknown;

      testBot.on("business_message", async (ctx) => {
        receivedMessage = ctx.businessMessage;
      });

      const businessUser = testBot.createUser({ first_name: "Business" });
      const chat = testBot.createChat({ type: "private" });

      const connectionUpdate = testBot.server.simulateBusinessConnection(businessUser, chat.id);
      const connectionId = connectionUpdate.business_connection?.id ?? "";

      const messageUpdate = testBot.server.simulateBusinessMessage(
        businessUser,
        chat,
        "Business message",
        connectionId,
      );

      await testBot.handleUpdate(messageUpdate);

      expect(receivedMessage).toBeDefined();
      expect((receivedMessage as { text: string }).text).toBe("Business message");
    });

    it("should throw error for non-existent business connection", async () => {
      const user = testBot.createUser({ first_name: "User" });
      const chat = testBot.createChat({ type: "private" });

      expect(() => {
        testBot.server.simulateBusinessMessage(user, chat, "Message", "non_existent_connection");
      }).toThrow("business connection not found");
    });

    it("should track business messages", async () => {
      const businessUser = testBot.createUser({ first_name: "Business" });
      const chat = testBot.createChat({ type: "private" });

      const connectionUpdate = testBot.server.simulateBusinessConnection(businessUser, chat.id);
      const connectionId = connectionUpdate.business_connection?.id ?? "";

      testBot.server.simulateBusinessMessage(businessUser, chat, "Message 1", connectionId);
      testBot.server.simulateBusinessMessage(businessUser, chat, "Message 2", connectionId);

      const messages = testBot.server.businessState.getBusinessMessages(connectionId);
      expect(messages).toHaveLength(2);
    });
  });

  describe("getBusinessConnection API", () => {
    it("should get a business connection", async () => {
      const businessUser = testBot.createUser({ first_name: "Business" });

      const connectionUpdate = testBot.server.simulateBusinessConnection(businessUser, 123456789);
      const connectionId = connectionUpdate.business_connection?.id ?? "";

      testBot.command("getconn", async (ctx) => {
        const connection = await ctx.api.getBusinessConnection(connectionId);
        await ctx.reply(`Connection user: ${connection.user.first_name}`);
      });

      const user = testBot.createUser({ first_name: "Admin" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/getconn");
      expect(response.text).toBe("Connection user: Business");
    });

    it("should throw error for non-existent connection", async () => {
      testBot.command("getconn", async (ctx) => {
        await ctx.api.getBusinessConnection("non_existent_id");
      });

      const user = testBot.createUser({ first_name: "Admin" });
      const chat = testBot.createChat({ type: "private" });

      await expect(testBot.sendCommand(user, chat, "/getconn")).rejects.toThrow(
        /business connection not found/,
      );
    });
  });

  describe("business connection state", () => {
    it("should update connection state", async () => {
      const businessUser = testBot.createUser({ first_name: "Business" });

      const connectionUpdate = testBot.server.simulateBusinessConnection(businessUser, 123456789, {
        canReply: true,
        isEnabled: true,
      });
      const connectionId = connectionUpdate.business_connection?.id ?? "";

      // Update the connection
      testBot.server.businessState.updateConnection(connectionId, {
        is_enabled: false,
      });

      const connection = testBot.server.businessState.getConnection(connectionId);
      expect(connection?.is_enabled).toBe(false);
      expect(connection?.can_reply).toBe(true); // Unchanged
    });

    it("should delete a connection", async () => {
      const businessUser = testBot.createUser({ first_name: "Business" });

      const connectionUpdate = testBot.server.simulateBusinessConnection(businessUser, 123456789);
      const connectionId = connectionUpdate.business_connection?.id ?? "";

      const deleted = testBot.server.businessState.deleteConnection(connectionId);
      expect(deleted).toBe(true);

      const connection = testBot.server.businessState.getConnection(connectionId);
      expect(connection).toBeUndefined();
    });

    it("should get connections for a user", async () => {
      const businessUser = testBot.createUser({ first_name: "Business" });

      testBot.server.simulateBusinessConnection(businessUser, 111);
      testBot.server.simulateBusinessConnection(businessUser, 222);

      const connections = testBot.server.businessState.getConnectionsForUser(businessUser.id);
      expect(connections).toHaveLength(2);
    });
  });
});
