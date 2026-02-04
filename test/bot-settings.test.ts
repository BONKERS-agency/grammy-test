import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestBot } from "../src/index.js";

describe("Bot Settings", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("bot name", () => {
    it("should get default bot name from botInfo", async () => {
      testBot.command("name", async (ctx) => {
        const nameInfo = await ctx.api.getMyName();
        await ctx.reply(`Name: ${nameInfo.name}`);
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/name");

      expect(response.text).toContain("TestBot");
    });

    it("should set and get bot name", async () => {
      testBot.command("setname", async (ctx) => {
        await ctx.api.setMyName("Custom Bot Name");
        const nameInfo = await ctx.api.getMyName();
        await ctx.reply(`Name set to: ${nameInfo.name}`);
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/setname");

      expect(response.text).toBe("Name set to: Custom Bot Name");
    });

    it("should support language-specific names", async () => {
      testBot.command("setnames", async (ctx) => {
        await ctx.api.setMyName("Bot Name", { language_code: "en" });
        await ctx.api.setMyName("Имя бота", { language_code: "ru" });

        const enName = await ctx.api.getMyName({ language_code: "en" });
        const ruName = await ctx.api.getMyName({ language_code: "ru" });

        await ctx.reply(`EN: ${enName.name}, RU: ${ruName.name}`);
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/setnames");

      expect(response.text).toBe("EN: Bot Name, RU: Имя бота");
    });

    it("should reject names longer than 64 characters", async () => {
      testBot.command("setname", async (ctx) => {
        await ctx.api.setMyName("A".repeat(65));
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      await expect(testBot.sendCommand(user, chat, "/setname")).rejects.toThrow(/name is too long/);
    });
  });

  describe("bot description", () => {
    it("should get empty description by default", async () => {
      testBot.command("desc", async (ctx) => {
        const descInfo = await ctx.api.getMyDescription();
        await ctx.reply(`Description: "${descInfo.description}"`);
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/desc");

      expect(response.text).toBe('Description: ""');
    });

    it("should set and get bot description", async () => {
      testBot.command("setdesc", async (ctx) => {
        await ctx.api.setMyDescription("This is a test bot for grammy-test framework");
        const descInfo = await ctx.api.getMyDescription();
        await ctx.reply(`Description: ${descInfo.description}`);
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/setdesc");

      expect(response.text).toBe("Description: This is a test bot for grammy-test framework");
    });

    it("should reject descriptions longer than 512 characters", async () => {
      testBot.command("setdesc", async (ctx) => {
        await ctx.api.setMyDescription("A".repeat(513));
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      await expect(testBot.sendCommand(user, chat, "/setdesc")).rejects.toThrow(
        /description is too long/,
      );
    });
  });

  describe("bot short description", () => {
    it("should get empty short description by default", async () => {
      testBot.command("shortdesc", async (ctx) => {
        const descInfo = await ctx.api.getMyShortDescription();
        await ctx.reply(`Short: "${descInfo.short_description}"`);
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/shortdesc");

      expect(response.text).toBe('Short: ""');
    });

    it("should set and get short description", async () => {
      testBot.command("setshort", async (ctx) => {
        await ctx.api.setMyShortDescription("A test bot");
        const descInfo = await ctx.api.getMyShortDescription();
        await ctx.reply(`Short: ${descInfo.short_description}`);
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/setshort");

      expect(response.text).toBe("Short: A test bot");
    });

    it("should reject short descriptions longer than 120 characters", async () => {
      testBot.command("setshort", async (ctx) => {
        await ctx.api.setMyShortDescription("A".repeat(121));
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      await expect(testBot.sendCommand(user, chat, "/setshort")).rejects.toThrow(
        /short description is too long/,
      );
    });
  });

  describe("default administrator rights", () => {
    it("should get empty rights by default", async () => {
      testBot.command("rights", async (ctx) => {
        const rights = await ctx.api.getMyDefaultAdministratorRights();
        await ctx.reply(`Has rights: ${Object.keys(rights).length > 0}`);
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/rights");

      expect(response.text).toBe("Has rights: false");
    });

    it("should set and get default rights for chats", async () => {
      testBot.command("setrights", async (ctx) => {
        await ctx.api.setMyDefaultAdministratorRights({
          rights: {
            can_manage_chat: true,
            can_delete_messages: true,
            can_restrict_members: true,
          },
        });
        const rights = await ctx.api.getMyDefaultAdministratorRights();
        await ctx.reply(
          `Can manage: ${rights.can_manage_chat}, Can delete: ${rights.can_delete_messages}`,
        );
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/setrights");

      expect(response.text).toBe("Can manage: true, Can delete: true");
    });

    it("should set different rights for channels", async () => {
      testBot.command("channelrights", async (ctx) => {
        await ctx.api.setMyDefaultAdministratorRights({
          rights: { can_post_messages: true, can_edit_messages: true },
          for_channels: true,
        });
        await ctx.api.setMyDefaultAdministratorRights({
          rights: { can_delete_messages: true },
          for_channels: false,
        });

        const channelRights = await ctx.api.getMyDefaultAdministratorRights({ for_channels: true });
        const chatRights = await ctx.api.getMyDefaultAdministratorRights({ for_channels: false });

        await ctx.reply(
          `Channel: ${channelRights.can_post_messages}, Chat: ${chatRights.can_delete_messages}`,
        );
      });

      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/channelrights");

      expect(response.text).toBe("Channel: true, Chat: true");
    });
  });
});
