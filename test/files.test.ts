import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestBot } from "../src/index.js";

describe("File Handling", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("Photo Messages", () => {
    it("should handle user sending a photo", async () => {
      let receivedPhotoCount = 0;

      testBot.on("message:photo", (ctx) => {
        receivedPhotoCount = ctx.message.photo?.length ?? 0;
        ctx.reply(`Received photo with ${receivedPhotoCount} sizes`);
      });

      const user = testBot.createUser({ first_name: "Alice" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendPhoto(user, chat, {
        width: 800,
        height: 600,
      });

      expect(response.text).toContain("Received photo");
      expect(receivedPhotoCount).toBeGreaterThan(0);
    });

    it("should receive multiple photo sizes", async () => {
      let photoSizes: Array<{ width: number; height: number }> = [];

      testBot.on("message:photo", (ctx) => {
        photoSizes = (ctx.message.photo ?? []).map((p) => ({ width: p.width, height: p.height }));
        ctx.reply("Photo received");
      });

      const user = testBot.createUser({ first_name: "Bob" });
      const chat = testBot.createChat({ type: "private" });

      await testBot.sendPhoto(user, chat, { width: 1920, height: 1080 });

      // Should have thumbnail, medium, and original sizes
      expect(photoSizes.length).toBeGreaterThanOrEqual(2);
      // Largest should be original size
      const largest = photoSizes[photoSizes.length - 1];
      expect(largest.width).toBe(1920);
      expect(largest.height).toBe(1080);
    });

    it("should handle photo with caption", async () => {
      let receivedCaption: string | undefined;

      testBot.on("message:photo", (ctx) => {
        receivedCaption = ctx.message.caption;
        ctx.reply("Photo with caption received");
      });

      const user = testBot.createUser({ first_name: "Charlie" });
      const chat = testBot.createChat({ type: "private" });

      await testBot.sendPhoto(
        user,
        chat,
        { width: 640, height: 480 },
        { caption: "My vacation photo" },
      );

      expect(receivedCaption).toBe("My vacation photo");
    });
  });

  describe("Document Messages", () => {
    it("should handle user sending a document", async () => {
      let receivedFileName: string | undefined;

      testBot.on("message:document", (ctx) => {
        receivedFileName = ctx.message.document?.file_name;
        ctx.reply(`Document received: ${receivedFileName}`);
      });

      const user = testBot.createUser({ first_name: "Dave" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendDocument(user, chat, {
        fileName: "report.pdf",
        mimeType: "application/pdf",
        fileSize: 1024 * 100,
      });

      expect(response.text).toBe("Document received: report.pdf");
      expect(receivedFileName).toBe("report.pdf");
    });

    it("should include document metadata", async () => {
      let doc: { fileName?: string; mimeType?: string; fileSize?: number } | undefined;

      testBot.on("message:document", (ctx) => {
        const d = ctx.message.document;
        if (d) {
          doc = {
            fileName: d.file_name,
            mimeType: d.mime_type,
            fileSize: d.file_size,
          };
        }
        ctx.reply("Got it");
      });

      const user = testBot.createUser({ first_name: "Eve" });
      const chat = testBot.createChat({ type: "private" });

      await testBot.sendDocument(user, chat, {
        fileName: "data.json",
        mimeType: "application/json",
        fileSize: 500,
      });

      expect(doc?.fileName).toBe("data.json");
      expect(doc?.mimeType).toBe("application/json");
      expect(doc?.fileSize).toBe(500);
    });
  });

  describe("Audio Messages", () => {
    it("should handle user sending audio", async () => {
      let audioInfo: { duration?: number; title?: string } | undefined;

      testBot.on("message:audio", (ctx) => {
        const a = ctx.message.audio;
        if (a) {
          audioInfo = { duration: a.duration, title: a.title };
        }
        ctx.reply("Audio received");
      });

      const user = testBot.createUser({ first_name: "Frank" });
      const chat = testBot.createChat({ type: "private" });

      await testBot.sendAudio(user, chat, {
        duration: 180,
        title: "My Song",
        performer: "Artist Name",
      });

      expect(audioInfo?.duration).toBe(180);
      expect(audioInfo?.title).toBe("My Song");
    });
  });

  describe("Video Messages", () => {
    it("should handle user sending video", async () => {
      let videoInfo: { width?: number; height?: number; duration?: number } | undefined;

      testBot.on("message:video", (ctx) => {
        const v = ctx.message.video;
        if (v) {
          videoInfo = { width: v.width, height: v.height, duration: v.duration };
        }
        ctx.reply("Video received");
      });

      const user = testBot.createUser({ first_name: "Grace" });
      const chat = testBot.createChat({ type: "private" });

      await testBot.sendVideo(user, chat, {
        width: 1280,
        height: 720,
        duration: 30,
      });

      expect(videoInfo?.width).toBe(1280);
      expect(videoInfo?.height).toBe(720);
      expect(videoInfo?.duration).toBe(30);
    });
  });

  describe("Voice Messages", () => {
    it("should handle user sending voice message", async () => {
      let voiceDuration: number | undefined;

      testBot.on("message:voice", (ctx) => {
        voiceDuration = ctx.message.voice?.duration;
        ctx.reply("Voice message received");
      });

      const user = testBot.createUser({ first_name: "Harry" });
      const chat = testBot.createChat({ type: "private" });

      await testBot.sendVoice(user, chat, { duration: 10 });

      expect(voiceDuration).toBe(10);
    });
  });

  describe("File Storage", () => {
    it("should store files with file_id", async () => {
      let fileId: string | undefined;

      testBot.on("message:document", (ctx) => {
        fileId = ctx.message.document?.file_id;
        ctx.reply("Stored");
      });

      const user = testBot.createUser({ first_name: "Ivy" });
      const chat = testBot.createChat({ type: "private" });

      await testBot.sendDocument(user, chat, {
        fileName: "test.txt",
        mimeType: "text/plain",
      });

      expect(fileId).toBeDefined();
      expect(fileId).toContain("document");

      // File should be retrievable
      const stored = testBot.server.fileState.getFile(fileId ?? "");
      expect(stored).toBeDefined();
    });

    it("should store file content if provided", async () => {
      const user = testBot.createUser({ first_name: "Jack" });
      const chat = testBot.createChat({ type: "private" });

      let fileId: string | undefined;

      testBot.on("message:document", (ctx) => {
        fileId = ctx.message.document?.file_id;
        ctx.reply("Got file");
      });

      const content = Buffer.from("Hello, World!");
      await testBot.sendDocument(user, chat, {
        fileName: "hello.txt",
        mimeType: "text/plain",
        content,
      });

      const stored = testBot.server.fileState.getFile(fileId ?? "");
      expect(stored?.content).toEqual(content);
    });
  });

  describe("Bot Sending Files", () => {
    it("should send document from bot", async () => {
      testBot.command("doc", async (ctx) => {
        await ctx.replyWithDocument("https://example.com/file.pdf");
      });

      const user = testBot.createUser({ first_name: "Kate" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/doc");

      expect(response.messages).toHaveLength(1);
      // Document message would be tracked
    });

    it("should send photo from bot", async () => {
      testBot.command("photo", async (ctx) => {
        await ctx.replyWithPhoto("https://example.com/image.jpg", {
          caption: "A nice photo",
        });
      });

      const user = testBot.createUser({ first_name: "Leo" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/photo");

      expect(response.messages).toHaveLength(1);
    });
  });

  describe("getFile API", () => {
    it("should retrieve file info", async () => {
      let storedFileId: string | undefined;

      testBot.on("message:document", (ctx) => {
        storedFileId = ctx.message.document?.file_id;
        ctx.reply("Stored");
      });

      testBot.command("getfile", async (ctx) => {
        if (storedFileId) {
          const file = await ctx.api.getFile(storedFileId);
          await ctx.reply(`File path: ${file.file_path || "none"}`);
        }
      });

      const user = testBot.createUser({ first_name: "Mike" });
      const chat = testBot.createChat({ type: "private" });

      // First send a document
      await testBot.sendDocument(user, chat, {
        fileName: "data.csv",
        mimeType: "text/csv",
      });

      // Then retrieve it
      const response = await testBot.sendCommand(user, chat, "/getfile");
      expect(response.text).toContain("File path:");
    });
  });

  describe("Stickers", () => {
    it("should handle sticker message", async () => {
      let stickerEmoji: string | undefined;

      testBot.on("message:sticker", (ctx) => {
        stickerEmoji = ctx.message.sticker?.emoji;
        ctx.reply("Nice sticker!");
      });

      const user = testBot.createUser({ first_name: "Nancy" });
      const chat = testBot.createChat({ type: "private" });

      await testBot.sendSticker(user, chat, {
        emoji: "😀",
        setName: "test_stickers",
      });

      expect(stickerEmoji).toBe("😀");
    });
  });

  describe("Contact", () => {
    it("should handle contact message", async () => {
      let contactPhone: string | undefined;

      testBot.on("message:contact", (ctx) => {
        contactPhone = ctx.message.contact?.phone_number;
        ctx.reply("Contact saved");
      });

      const user = testBot.createUser({ first_name: "Oscar" });
      const chat = testBot.createChat({ type: "private" });

      await testBot.sendContact(user, chat, {
        phoneNumber: "+1234567890",
        firstName: "John",
        lastName: "Doe",
      });

      expect(contactPhone).toBe("+1234567890");
    });
  });

  describe("Location", () => {
    it("should handle location message", async () => {
      let location: { lat: number; lon: number } | undefined;

      testBot.on("message:location", (ctx) => {
        const loc = ctx.message.location;
        if (loc) {
          location = { lat: loc.latitude, lon: loc.longitude };
        }
        ctx.reply("Location received");
      });

      const user = testBot.createUser({ first_name: "Paul" });
      const chat = testBot.createChat({ type: "private" });

      await testBot.sendLocation(user, chat, {
        latitude: 40.7128,
        longitude: -74.006,
      });

      expect(location?.lat).toBe(40.7128);
      expect(location?.lon).toBe(-74.006);
    });
  });

  describe("Venue", () => {
    it("should handle venue message", async () => {
      let venueName: string | undefined;

      testBot.on("message:venue", (ctx) => {
        venueName = ctx.message.venue?.title;
        ctx.reply("Venue noted");
      });

      const user = testBot.createUser({ first_name: "Quinn" });
      const chat = testBot.createChat({ type: "private" });

      await testBot.sendVenue(user, chat, {
        latitude: 40.7128,
        longitude: -74.006,
        title: "Central Park",
        address: "New York, NY",
      });

      expect(venueName).toBe("Central Park");
    });
  });
});
