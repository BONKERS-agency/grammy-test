import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestBot } from "../src/index.js";

describe("Message Formatting", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("Markdown Parsing", () => {
    it("should parse bold text", async () => {
      testBot.command("bold", async (ctx) => {
        await ctx.reply("This is *bold* text", { parse_mode: "Markdown" });
      });

      const user = testBot.createUser({ first_name: "Alice" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/bold");

      expect(response.text).toBe("This is bold text");
      expect(response.entities).toContainEqual(
        expect.objectContaining({ type: "bold", offset: 8, length: 4 }),
      );
    });

    it("should parse italic text", async () => {
      testBot.command("italic", async (ctx) => {
        await ctx.reply("This is _italic_ text", { parse_mode: "Markdown" });
      });

      const user = testBot.createUser({ first_name: "Bob" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/italic");

      expect(response.text).toBe("This is italic text");
      expect(response.entities).toContainEqual(
        expect.objectContaining({ type: "italic", offset: 8, length: 6 }),
      );
    });

    it("should parse code", async () => {
      testBot.command("code", async (ctx) => {
        await ctx.reply("Use `console.log()` for debugging", { parse_mode: "Markdown" });
      });

      const user = testBot.createUser({ first_name: "Charlie" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/code");

      expect(response.text).toBe("Use console.log() for debugging");
      expect(response.entities).toContainEqual(
        expect.objectContaining({ type: "code", offset: 4, length: 13 }),
      );
    });

    it("should parse links", async () => {
      testBot.command("link", async (ctx) => {
        await ctx.reply("Visit [our website](https://example.com)", { parse_mode: "Markdown" });
      });

      const user = testBot.createUser({ first_name: "Dave" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/link");

      expect(response.text).toBe("Visit our website");
      expect(response.entities).toContainEqual(
        expect.objectContaining({
          type: "text_link",
          offset: 6,
          length: 11,
          url: "https://example.com",
        }),
      );
    });

    it("should parse pre-formatted code blocks", async () => {
      testBot.command("pre", async (ctx) => {
        await ctx.reply("```\nfunction hello() {\n  return 'world';\n}\n```", {
          parse_mode: "Markdown",
        });
      });

      const user = testBot.createUser({ first_name: "Eve" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/pre");

      expect(response.entities).toContainEqual(expect.objectContaining({ type: "pre" }));
    });

    it("should parse multiple formats in one message", async () => {
      testBot.command("mixed", async (ctx) => {
        await ctx.reply("*Bold* and _italic_ and `code`", { parse_mode: "Markdown" });
      });

      const user = testBot.createUser({ first_name: "Frank" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/mixed");

      expect(response.text).toBe("Bold and italic and code");
      expect(response.entities).toHaveLength(3);
      expect(response.hasEntity("bold")).toBe(true);
      expect(response.hasEntity("italic")).toBe(true);
      expect(response.hasEntity("code")).toBe(true);
    });
  });

  describe("MarkdownV2 Parsing", () => {
    it("should parse bold in MarkdownV2", async () => {
      testBot.command("bold2", async (ctx) => {
        await ctx.reply("This is *bold* text", { parse_mode: "MarkdownV2" });
      });

      const user = testBot.createUser({ first_name: "Grace" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/bold2");

      expect(response.text).toBe("This is bold text");
      expect(response.hasEntity("bold")).toBe(true);
    });

    it("should parse underline in MarkdownV2", async () => {
      testBot.command("underline", async (ctx) => {
        await ctx.reply("This is __underlined__ text", { parse_mode: "MarkdownV2" });
      });

      const user = testBot.createUser({ first_name: "Harry" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/underline");

      expect(response.text).toBe("This is underlined text");
      expect(response.hasEntity("underline")).toBe(true);
    });

    it("should parse strikethrough in MarkdownV2", async () => {
      testBot.command("strike", async (ctx) => {
        await ctx.reply("This is ~strikethrough~ text", { parse_mode: "MarkdownV2" });
      });

      const user = testBot.createUser({ first_name: "Ivy" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/strike");

      expect(response.text).toBe("This is strikethrough text");
      expect(response.hasEntity("strikethrough")).toBe(true);
    });

    it("should parse spoiler in MarkdownV2", async () => {
      testBot.command("spoiler", async (ctx) => {
        await ctx.reply("The answer is ||42||", { parse_mode: "MarkdownV2" });
      });

      const user = testBot.createUser({ first_name: "Jack" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/spoiler");

      expect(response.text).toBe("The answer is 42");
      expect(response.hasEntity("spoiler")).toBe(true);
    });

    it("should handle escaped characters in MarkdownV2", async () => {
      testBot.command("escaped", async (ctx) => {
        await ctx.reply("Use \\*asterisks\\* literally", { parse_mode: "MarkdownV2" });
      });

      const user = testBot.createUser({ first_name: "Kate" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/escaped");

      expect(response.text).toBe("Use *asterisks* literally");
      expect(response.hasEntity("bold")).toBe(false);
    });

    it("should parse multiple formatting types", async () => {
      testBot.command("multi", async (ctx) => {
        await ctx.reply("*bold* and _italic_", { parse_mode: "MarkdownV2" });
      });

      const user = testBot.createUser({ first_name: "Leo" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/multi");

      expect(response.hasEntity("bold")).toBe(true);
      expect(response.hasEntity("italic")).toBe(true);
    });
  });

  describe("HTML Parsing", () => {
    it("should parse bold HTML", async () => {
      testBot.command("htmlbold", async (ctx) => {
        await ctx.reply("This is <b>bold</b> text", { parse_mode: "HTML" });
      });

      const user = testBot.createUser({ first_name: "Mike" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/htmlbold");

      expect(response.text).toBe("This is bold text");
      expect(response.hasEntity("bold")).toBe(true);
    });

    it("should parse italic HTML", async () => {
      testBot.command("htmlitalic", async (ctx) => {
        await ctx.reply("This is <i>italic</i> text", { parse_mode: "HTML" });
      });

      const user = testBot.createUser({ first_name: "Nancy" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/htmlitalic");

      expect(response.text).toBe("This is italic text");
      expect(response.hasEntity("italic")).toBe(true);
    });

    it("should parse code HTML", async () => {
      testBot.command("htmlcode", async (ctx) => {
        await ctx.reply("Use <code>const x = 1</code>", { parse_mode: "HTML" });
      });

      const user = testBot.createUser({ first_name: "Oscar" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/htmlcode");

      expect(response.text).toBe("Use const x = 1");
      expect(response.hasEntity("code")).toBe(true);
    });

    it("should parse pre HTML with language", async () => {
      testBot.command("htmlpre", async (ctx) => {
        await ctx.reply('<pre><code class="language-javascript">console.log("hi")</code></pre>', {
          parse_mode: "HTML",
        });
      });

      const user = testBot.createUser({ first_name: "Paul" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/htmlpre");

      expect(response.entities).toContainEqual(
        expect.objectContaining({
          type: "pre",
          language: "javascript",
        }),
      );
    });

    it("should parse links in HTML", async () => {
      testBot.command("htmllink", async (ctx) => {
        await ctx.reply('Visit <a href="https://example.com">our site</a>', { parse_mode: "HTML" });
      });

      const user = testBot.createUser({ first_name: "Quinn" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/htmllink");

      expect(response.text).toBe("Visit our site");
      expect(response.entities).toContainEqual(
        expect.objectContaining({
          type: "text_link",
          url: "https://example.com",
        }),
      );
    });

    it("should parse user mentions in HTML", async () => {
      testBot.command("htmlmention", async (ctx) => {
        await ctx.reply('Hello <a href="tg://user?id=123456">John</a>!', { parse_mode: "HTML" });
      });

      const user = testBot.createUser({ first_name: "Rachel" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/htmlmention");

      expect(response.text).toBe("Hello John!");
      expect(response.entities).toContainEqual(
        expect.objectContaining({
          type: "text_mention",
        }),
      );
    });

    it("should parse underline in HTML", async () => {
      testBot.command("htmlunder", async (ctx) => {
        await ctx.reply("This is <u>underlined</u> text", { parse_mode: "HTML" });
      });

      const user = testBot.createUser({ first_name: "Steve" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/htmlunder");

      expect(response.hasEntity("underline")).toBe(true);
    });

    it("should parse strikethrough in HTML", async () => {
      testBot.command("htmlstrike", async (ctx) => {
        await ctx.reply("This is <s>strikethrough</s> text", { parse_mode: "HTML" });
      });

      const user = testBot.createUser({ first_name: "Tina" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/htmlstrike");

      expect(response.hasEntity("strikethrough")).toBe(true);
    });

    it("should parse spoiler in HTML", async () => {
      testBot.command("htmlspoiler", async (ctx) => {
        await ctx.reply("The secret is <tg-spoiler>revealed</tg-spoiler>", { parse_mode: "HTML" });
      });

      const user = testBot.createUser({ first_name: "Uma" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/htmlspoiler");

      expect(response.hasEntity("spoiler")).toBe(true);
    });

    it("should parse custom emoji in HTML", async () => {
      testBot.command("htmlemoji", async (ctx) => {
        await ctx.reply('<tg-emoji emoji-id="5368324170671202286">😀</tg-emoji>', {
          parse_mode: "HTML",
        });
      });

      const user = testBot.createUser({ first_name: "Victor" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/htmlemoji");

      expect(response.entities).toContainEqual(
        expect.objectContaining({
          type: "custom_emoji",
          custom_emoji_id: "5368324170671202286",
        }),
      );
    });

    it("should parse blockquote in HTML", async () => {
      testBot.command("htmlquote", async (ctx) => {
        await ctx.reply("<blockquote>This is a quote</blockquote>", { parse_mode: "HTML" });
      });

      const user = testBot.createUser({ first_name: "Wendy" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/htmlquote");

      expect(response.hasEntity("blockquote")).toBe(true);
    });
  });

  describe("Entity Helper Methods", () => {
    it("should check entity existence with hasEntity", async () => {
      testBot.command("check", async (ctx) => {
        await ctx.reply("*Bold* and `code`", { parse_mode: "Markdown" });
      });

      const user = testBot.createUser({ first_name: "Xavier" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/check");

      expect(response.hasEntity("bold")).toBe(true);
      expect(response.hasEntity("code")).toBe(true);
      expect(response.hasEntity("italic")).toBe(false);
      expect(response.hasEntity("spoiler")).toBe(false);
    });

    it("should access entities array", async () => {
      testBot.command("entities", async (ctx) => {
        await ctx.reply("*a* _b_ `c`", { parse_mode: "Markdown" });
      });

      const user = testBot.createUser({ first_name: "Yara" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/entities");

      expect(response.entities).toBeDefined();
      expect(response.entities).toHaveLength(3);

      const types = (response.entities ?? []).map((e) => e.type);
      expect(types).toContain("bold");
      expect(types).toContain("italic");
      expect(types).toContain("code");
    });
  });

  describe("No Formatting", () => {
    it("should not parse when no parse_mode", async () => {
      testBot.command("plain", async (ctx) => {
        await ctx.reply("This *is* plain text");
      });

      const user = testBot.createUser({ first_name: "Zoe" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/plain");

      expect(response.text).toBe("This *is* plain text");
      expect(response.entities).toBeUndefined();
    });
  });

  describe("User Sending Formatted Messages", () => {
    it("should receive user message with entities", async () => {
      let receivedEntities: Array<{ type: string }> = [];

      testBot.on("message:text", (ctx) => {
        receivedEntities = ctx.message.entities || [];
        ctx.reply("Got formatted message");
      });

      const user = testBot.createUser({ first_name: "Alice" });
      const chat = testBot.createChat({ type: "private" });

      await testBot.sendMessage(user, chat, "Check this *important* thing", {
        parseMode: "Markdown",
      });

      expect(receivedEntities).toHaveLength(1);
      expect(receivedEntities[0].type).toBe("bold");
    });
  });

  describe("Caption Formatting", () => {
    it("should parse formatted captions", async () => {
      testBot.command("photo", async (ctx) => {
        await ctx.replyWithPhoto("https://example.com/photo.jpg", {
          caption: "*Bold caption*",
          parse_mode: "Markdown",
        });
      });

      const user = testBot.createUser({ first_name: "Bob" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/photo");

      expect(response.captionEntities).toBeDefined();
      expect(response.captionEntities).toContainEqual(expect.objectContaining({ type: "bold" }));
    });
  });

  describe("Edit Message Formatting", () => {
    it("should parse formatting in edited messages", async () => {
      const _editedEntities: Array<{ type: string }> = [];

      testBot.command("msg", async (ctx) => {
        const msg = await ctx.reply("Original");
        await ctx.api.editMessageText(ctx.chat.id, msg.message_id, "*Edited bold*", {
          parse_mode: "Markdown",
        });
      });

      const user = testBot.createUser({ first_name: "Charlie" });
      const chat = testBot.createChat({ type: "private" });

      const response = await testBot.sendCommand(user, chat, "/msg");

      // The edited message should have entities
      expect(response.editedMessages).toHaveLength(1);
      expect(response.editedMessages[0].entities).toContainEqual(
        expect.objectContaining({ type: "bold" }),
      );
    });
  });
});
