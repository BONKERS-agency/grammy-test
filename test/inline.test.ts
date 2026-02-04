import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestBot } from "../src/index.js";

describe("Inline Queries", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("Inline Query Handling", () => {
    it("should handle inline query", async () => {
      testBot.on("inline_query", async (ctx) => {
        await ctx.answerInlineQuery([
          {
            type: "article",
            id: "1",
            title: "Result 1",
            input_message_content: { message_text: "You selected result 1" },
          },
        ]);
      });

      const user = testBot.createUser({ first_name: "Alice" });
      const response = await testBot.sendInlineQuery(user, "search term");

      expect(response.inlineResults).toBeDefined();
      expect(response.inlineResults).toHaveLength(1);
      expect(response.inlineResults?.[0].title).toBe("Result 1");
    });

    it("should return multiple results", async () => {
      testBot.on("inline_query", async (ctx) => {
        const query = ctx.inlineQuery.query;
        await ctx.answerInlineQuery([
          {
            type: "article",
            id: "1",
            title: `Result for: ${query}`,
            input_message_content: { message_text: `Query: ${query}` },
          },
          {
            type: "article",
            id: "2",
            title: "Another result",
            input_message_content: { message_text: "Another option" },
          },
          {
            type: "article",
            id: "3",
            title: "Third result",
            input_message_content: { message_text: "Third option" },
          },
        ]);
      });

      const user = testBot.createUser({ first_name: "Bob" });
      const response = await testBot.sendInlineQuery(user, "hello");

      expect(response.inlineResults).toHaveLength(3);
      expect(response.inlineResults?.[0].title).toBe("Result for: hello");
    });

    it("should handle empty query", async () => {
      testBot.on("inline_query", async (ctx) => {
        if (ctx.inlineQuery.query === "") {
          await ctx.answerInlineQuery([
            {
              type: "article",
              id: "default",
              title: "Type to search...",
              input_message_content: { message_text: "Please type a search query" },
            },
          ]);
        }
      });

      const user = testBot.createUser({ first_name: "Charlie" });
      const response = await testBot.sendInlineQuery(user, "");

      expect(response.inlineResults).toHaveLength(1);
      expect(response.inlineResults?.[0].title).toBe("Type to search...");
    });

    it("should filter results based on query", async () => {
      const items = ["Apple", "Banana", "Cherry", "Apricot", "Avocado"];

      testBot.on("inline_query", async (ctx) => {
        const query = ctx.inlineQuery.query.toLowerCase();
        const filtered = items.filter((item) => item.toLowerCase().includes(query));

        await ctx.answerInlineQuery(
          filtered.map((item, i) => ({
            type: "article" as const,
            id: String(i),
            title: item,
            input_message_content: { message_text: `Selected: ${item}` },
          })),
        );
      });

      const user = testBot.createUser({ first_name: "Dave" });

      const response1 = await testBot.sendInlineQuery(user, "ap");
      expect(response1.inlineResults).toHaveLength(2); // Apple, Apricot

      const response2 = await testBot.sendInlineQuery(user, "ban");
      expect(response2.inlineResults).toHaveLength(1); // Banana
    });
  });

  describe("Inline Query Options", () => {
    it("should handle offset for pagination", async () => {
      testBot.on("inline_query", async (ctx) => {
        const offset = parseInt(ctx.inlineQuery.offset || "0", 10);
        const pageSize = 5;

        const results = Array.from({ length: pageSize }, (_, i) => ({
          type: "article" as const,
          id: String(offset + i),
          title: `Result ${offset + i + 1}`,
          input_message_content: { message_text: `Item ${offset + i + 1}` },
        }));

        await ctx.answerInlineQuery(results, {
          next_offset: String(offset + pageSize),
        });
      });

      const user = testBot.createUser({ first_name: "Eve" });

      const page1 = await testBot.sendInlineQuery(user, "search");
      expect(page1.inlineResults).toHaveLength(5);
      expect(page1.inlineResults?.[0].title).toBe("Result 1");

      const page2 = await testBot.sendInlineQuery(user, "search", { offset: "5" });
      expect(page2.inlineResults).toHaveLength(5);
      expect(page2.inlineResults?.[0].title).toBe("Result 6");
    });

    it("should handle chat type filter", async () => {
      testBot.on("inline_query", async (ctx) => {
        const chatType = ctx.inlineQuery.chat_type;
        await ctx.answerInlineQuery([
          {
            type: "article",
            id: "1",
            title: `Chat type: ${chatType || "unknown"}`,
            input_message_content: { message_text: `From ${chatType}` },
          },
        ]);
      });

      const user = testBot.createUser({ first_name: "Frank" });

      const privateResponse = await testBot.sendInlineQuery(user, "test", { chatType: "private" });
      expect(privateResponse.inlineResults?.[0].title).toBe("Chat type: private");

      const groupResponse = await testBot.sendInlineQuery(user, "test", { chatType: "group" });
      expect(groupResponse.inlineResults?.[0].title).toBe("Chat type: group");
    });
  });

  describe("Chosen Inline Result", () => {
    it("should handle chosen inline result", async () => {
      let chosenResultId: string | undefined;

      testBot.on("inline_query", async (ctx) => {
        await ctx.answerInlineQuery([
          {
            type: "article",
            id: "result-1",
            title: "Option 1",
            input_message_content: { message_text: "Chose option 1" },
          },
          {
            type: "article",
            id: "result-2",
            title: "Option 2",
            input_message_content: { message_text: "Chose option 2" },
          },
        ]);
      });

      testBot.on("chosen_inline_result", (ctx) => {
        chosenResultId = ctx.chosenInlineResult.result_id;
      });

      const user = testBot.createUser({ first_name: "Grace" });

      // Send inline query
      await testBot.sendInlineQuery(user, "options");

      // Choose a result
      await testBot.chooseInlineResult(user, "result-2", "options");

      expect(chosenResultId).toBe("result-2");
    });

    it("should include query in chosen result", async () => {
      let receivedQuery: string | undefined;

      testBot.on("chosen_inline_result", (ctx) => {
        receivedQuery = ctx.chosenInlineResult.query;
      });

      const user = testBot.createUser({ first_name: "Harry" });

      await testBot.chooseInlineResult(user, "some-id", "my search query");

      expect(receivedQuery).toBe("my search query");
    });
  });

  describe("Different Result Types", () => {
    it("should handle photo results", async () => {
      testBot.on("inline_query", async (ctx) => {
        await ctx.answerInlineQuery([
          {
            type: "photo",
            id: "photo-1",
            photo_url: "https://example.com/photo.jpg",
            thumbnail_url: "https://example.com/thumb.jpg",
          },
        ]);
      });

      const user = testBot.createUser({ first_name: "Ivy" });
      const response = await testBot.sendInlineQuery(user, "photos");

      expect(response.inlineResults).toHaveLength(1);
      expect(response.inlineResults?.[0].type).toBe("photo");
    });

    it("should handle gif results", async () => {
      testBot.on("inline_query", async (ctx) => {
        await ctx.answerInlineQuery([
          {
            type: "gif",
            id: "gif-1",
            gif_url: "https://example.com/animation.gif",
            thumbnail_url: "https://example.com/thumb.gif",
          },
        ]);
      });

      const user = testBot.createUser({ first_name: "Jack" });
      const response = await testBot.sendInlineQuery(user, "gifs");

      expect(response.inlineResults).toHaveLength(1);
      expect(response.inlineResults?.[0].type).toBe("gif");
    });

    it("should handle cached results", async () => {
      testBot.on("inline_query", async (ctx) => {
        await ctx.answerInlineQuery(
          [
            {
              type: "article",
              id: "cached",
              title: "Cached result",
              input_message_content: { message_text: "Cached" },
            },
          ],
          { cache_time: 300 },
        );
      });

      const user = testBot.createUser({ first_name: "Kate" });
      const response = await testBot.sendInlineQuery(user, "cache");

      expect(response.inlineResults).toHaveLength(1);
    });
  });

  describe("Personal Results", () => {
    it("should support personal results", async () => {
      testBot.on("inline_query", async (ctx) => {
        await ctx.answerInlineQuery(
          [
            {
              type: "article",
              id: "personal",
              title: `Personal for ${ctx.from.first_name}`,
              input_message_content: { message_text: "Personal result" },
            },
          ],
          { is_personal: true },
        );
      });

      const user = testBot.createUser({ first_name: "Leo" });
      const response = await testBot.sendInlineQuery(user, "personal");

      expect(response.inlineResults?.[0].title).toBe("Personal for Leo");
    });
  });

  describe("Switch PM Button", () => {
    it("should support switch to PM button", async () => {
      testBot.on("inline_query", async (ctx) => {
        await ctx.answerInlineQuery([], {
          button: {
            text: "Start the bot first",
            start_parameter: "inline",
          },
        });
      });

      const user = testBot.createUser({ first_name: "Mike" });
      const response = await testBot.sendInlineQuery(user, "need-start");

      expect(response.inlineResults).toHaveLength(0);
      // The button info would be tracked in the API call
    });
  });
});
