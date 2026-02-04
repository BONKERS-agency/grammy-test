import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestBot } from "../src/index.js";

describe("Profile Photos", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("getUserProfilePhotos", () => {
    it("should return empty photos for user without profile photos", async () => {
      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      testBot.command("photos", async (ctx) => {
        const photos = await ctx.api.getUserProfilePhotos(ctx.from?.id ?? 0);
        await ctx.reply(`Total: ${photos.total_count}`);
      });

      const response = await testBot.sendCommand(user, chat, "/photos");

      expect(response.text).toBe("Total: 0");
    });

    it("should return profile photos after adding them", async () => {
      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      // Add profile photos for the user
      testBot.server.memberState.addProfilePhoto(user.id, 640, 640);
      testBot.server.memberState.addProfilePhoto(user.id, 800, 800);

      testBot.command("photos", async (ctx) => {
        const photos = await ctx.api.getUserProfilePhotos(ctx.from?.id ?? 0);
        await ctx.reply(`Total: ${photos.total_count}, Photos: ${photos.photos.length}`);
      });

      const response = await testBot.sendCommand(user, chat, "/photos");

      expect(response.text).toBe("Total: 2, Photos: 2");
    });

    it("should return multiple sizes for each photo", async () => {
      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      testBot.server.memberState.addProfilePhoto(user.id, 640, 640);

      testBot.command("photos", async (ctx) => {
        const photos = await ctx.api.getUserProfilePhotos(ctx.from?.id ?? 0);
        const sizes = photos.photos[0]?.length || 0;
        await ctx.reply(`Sizes: ${sizes}`);
      });

      const response = await testBot.sendCommand(user, chat, "/photos");

      expect(response.text).toBe("Sizes: 3"); // small, medium, large
    });

    it("should support offset and limit", async () => {
      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      // Add 5 profile photos
      for (let i = 0; i < 5; i++) {
        testBot.server.memberState.addProfilePhoto(user.id, 640, 640);
      }

      testBot.command("photos", async (ctx) => {
        const allPhotos = await ctx.api.getUserProfilePhotos(ctx.from?.id ?? 0);
        const limitedPhotos = await ctx.api.getUserProfilePhotos(ctx.from?.id ?? 0, {
          offset: 1,
          limit: 2,
        });
        await ctx.reply(`All: ${allPhotos.photos.length}, Limited: ${limitedPhotos.photos.length}`);
      });

      const response = await testBot.sendCommand(user, chat, "/photos");

      expect(response.text).toBe("All: 5, Limited: 2");
    });

    it("should report correct total_count even with offset", async () => {
      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      // Add 5 profile photos
      for (let i = 0; i < 5; i++) {
        testBot.server.memberState.addProfilePhoto(user.id, 640, 640);
      }

      testBot.command("photos", async (ctx) => {
        const photos = await ctx.api.getUserProfilePhotos(ctx.from?.id ?? 0, {
          offset: 2,
          limit: 2,
        });
        await ctx.reply(`Total: ${photos.total_count}, Returned: ${photos.photos.length}`);
      });

      const response = await testBot.sendCommand(user, chat, "/photos");

      expect(response.text).toBe("Total: 5, Returned: 2");
    });

    it("should get profile photos of another user", async () => {
      const user = testBot.createUser({ first_name: "Requester" });
      const targetUser = testBot.createUser({ first_name: "Target" });
      const chat = testBot.createChat({ type: "private" });

      testBot.server.memberState.addProfilePhoto(targetUser.id, 800, 800);
      testBot.server.memberState.addProfilePhoto(targetUser.id, 640, 640);

      testBot.command("getphotos", async (ctx) => {
        const photos = await ctx.api.getUserProfilePhotos(targetUser.id);
        await ctx.reply(`Target photos: ${photos.total_count}`);
      });

      const response = await testBot.sendCommand(user, chat, "/getphotos");

      expect(response.text).toBe("Target photos: 2");
    });
  });

  describe("photo sizes", () => {
    it("should have increasing sizes", async () => {
      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      testBot.server.memberState.addProfilePhoto(user.id, 640, 640);

      testBot.command("sizes", async (ctx) => {
        const photos = await ctx.api.getUserProfilePhotos(ctx.from?.id ?? 0);
        const sizes = photos.photos[0];
        const widths = sizes.map((s) => s.width).join(",");
        await ctx.reply(`Widths: ${widths}`);
      });

      const response = await testBot.sendCommand(user, chat, "/sizes");

      // Sizes should be 160, 320, 640 (25%, 50%, 100% of original)
      expect(response.text).toBe("Widths: 160,320,640");
    });

    it("should have file IDs for each size", async () => {
      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      testBot.server.memberState.addProfilePhoto(user.id, 640, 640);

      testBot.command("fileids", async (ctx) => {
        const photos = await ctx.api.getUserProfilePhotos(ctx.from?.id ?? 0);
        const sizes = photos.photos[0];
        const hasFileIds = sizes.every((s) => s.file_id && s.file_unique_id);
        await ctx.reply(`Has file IDs: ${hasFileIds}`);
      });

      const response = await testBot.sendCommand(user, chat, "/fileids");

      expect(response.text).toBe("Has file IDs: true");
    });
  });

  describe("clearing profile photos", () => {
    it("should clear all profile photos", async () => {
      const user = testBot.createUser({ first_name: "Test" });
      const chat = testBot.createChat({ type: "private" });

      testBot.server.memberState.addProfilePhoto(user.id, 640, 640);
      testBot.server.memberState.addProfilePhoto(user.id, 640, 640);

      // Clear photos
      testBot.server.memberState.clearProfilePhotos(user.id);

      testBot.command("photos", async (ctx) => {
        const photos = await ctx.api.getUserProfilePhotos(ctx.from?.id ?? 0);
        await ctx.reply(`Total: ${photos.total_count}`);
      });

      const response = await testBot.sendCommand(user, chat, "/photos");

      expect(response.text).toBe("Total: 0");
    });
  });
});
