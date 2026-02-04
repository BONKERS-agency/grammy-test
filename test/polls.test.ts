import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestBot } from "../src/index.js";

describe("Polls", () => {
  let testBot: TestBot;

  beforeEach(() => {
    testBot = new TestBot();
  });

  afterEach(() => {
    testBot.dispose();
  });

  describe("Create Polls", () => {
    it("should create a regular poll", async () => {
      const user = testBot.createUser({ first_name: "Alice" });
      const chat = testBot.createChat({ type: "group", title: "Test Group" });

      testBot.command("poll", async (ctx) => {
        await ctx.replyWithPoll("What's your favorite color?", ["Red", "Blue", "Green"]);
      });

      const response = await testBot.sendCommand(user, chat, "/poll");

      expect(response.poll).toBeDefined();
      expect(response.poll?.question).toBe("What's your favorite color?");
      expect(response.poll?.options).toHaveLength(3);
      expect(response.poll?.options[0].text).toBe("Red");
      expect(response.poll?.type).toBe("regular");
      expect(response.poll?.is_anonymous).toBe(true);
    });

    it("should create a quiz poll", async () => {
      const user = testBot.createUser({ first_name: "Bob" });
      const chat = testBot.createChat({ type: "group", title: "Test Group" });

      testBot.command("quiz", async (ctx) => {
        await ctx.replyWithPoll("Capital of France?", ["London", "Paris", "Berlin"], {
          type: "quiz",
          correct_option_id: 1,
          explanation: "Paris is the capital of France.",
        });
      });

      const response = await testBot.sendCommand(user, chat, "/quiz");

      expect(response.poll).toBeDefined();
      expect(response.poll?.question).toBe("Capital of France?");
      expect(response.poll?.type).toBe("quiz");
      expect(response.poll?.correct_option_id).toBe(1);
      expect(response.poll?.explanation).toBe("Paris is the capital of France.");
    });

    it("should create a non-anonymous poll", async () => {
      const user = testBot.createUser({ first_name: "Charlie" });
      const chat = testBot.createChat({ type: "group", title: "Test Group" });

      testBot.command("publicpoll", async (ctx) => {
        await ctx.replyWithPoll("Meeting time?", ["9 AM", "10 AM", "11 AM"], {
          is_anonymous: false,
        });
      });

      const response = await testBot.sendCommand(user, chat, "/publicpoll");

      expect(response.poll).toBeDefined();
      expect(response.poll?.is_anonymous).toBe(false);
    });

    it("should create a multiple choice poll", async () => {
      const user = testBot.createUser({ first_name: "Dave" });
      const chat = testBot.createChat({ type: "group", title: "Test Group" });

      testBot.command("multi", async (ctx) => {
        await ctx.replyWithPoll("Select all that apply:", ["Option A", "Option B", "Option C"], {
          allows_multiple_answers: true,
        });
      });

      const response = await testBot.sendCommand(user, chat, "/multi");

      expect(response.poll).toBeDefined();
      expect(response.poll?.allows_multiple_answers).toBe(true);
    });
  });

  describe("Poll Voting", () => {
    it("should record a vote", async () => {
      const user = testBot.createUser({ first_name: "Eve" });
      const chat = testBot.createChat({ type: "group", title: "Test Group" });

      // Create a poll first
      testBot.command("poll", async (ctx) => {
        await ctx.replyWithPoll("Best language?", ["JavaScript", "TypeScript", "Python"]);
      });

      const pollResponse = await testBot.sendCommand(user, chat, "/poll");
      const pollId = pollResponse.poll?.id ?? "";

      // Vote on the poll
      const voter = testBot.createUser({ first_name: "Voter" });
      await testBot.vote(voter, pollId, [1]); // Vote for TypeScript

      // Check the vote was recorded
      const poll = testBot.server.pollState.getPoll(pollId);
      expect(poll?.options[1].voter_count).toBe(1);
      expect(poll?.total_voter_count).toBe(1);
    });

    it("should handle multiple votes in non-anonymous poll", async () => {
      const user = testBot.createUser({ first_name: "Frank" });
      const chat = testBot.createChat({ type: "group", title: "Test Group" });

      testBot.command("poll", async (ctx) => {
        await ctx.replyWithPoll("Favorite?", ["A", "B", "C"], { is_anonymous: false });
      });

      const pollResponse = await testBot.sendCommand(user, chat, "/poll");
      const pollId = pollResponse.poll?.id ?? "";

      // Multiple users vote
      const voter1 = testBot.createUser({ first_name: "Voter1" });
      const voter2 = testBot.createUser({ first_name: "Voter2" });
      const voter3 = testBot.createUser({ first_name: "Voter3" });

      await testBot.vote(voter1, pollId, [0]);
      await testBot.vote(voter2, pollId, [0]);
      await testBot.vote(voter3, pollId, [1]);

      const poll = testBot.server.pollState.getPoll(pollId);
      expect(poll?.options[0].voter_count).toBe(2);
      expect(poll?.options[1].voter_count).toBe(1);
      expect(poll?.total_voter_count).toBe(3);
    });

    it("should handle changing vote", async () => {
      const user = testBot.createUser({ first_name: "Grace" });
      const chat = testBot.createChat({ type: "group", title: "Test Group" });

      testBot.command("poll", async (ctx) => {
        await ctx.replyWithPoll("Choice?", ["X", "Y", "Z"]);
      });

      const pollResponse = await testBot.sendCommand(user, chat, "/poll");
      const pollId = pollResponse.poll?.id ?? "";

      const voter = testBot.createUser({ first_name: "Voter" });

      // First vote
      await testBot.vote(voter, pollId, [0]);
      let poll = testBot.server.pollState.getPoll(pollId);
      expect(poll?.options[0].voter_count).toBe(1);

      // Change vote
      await testBot.vote(voter, pollId, [2]);
      poll = testBot.server.pollState.getPoll(pollId);
      expect(poll?.options[0].voter_count).toBe(0);
      expect(poll?.options[2].voter_count).toBe(1);
      expect(poll?.total_voter_count).toBe(1); // Still 1 voter
    });

    it("should handle retract vote", async () => {
      const user = testBot.createUser({ first_name: "Harry" });
      const chat = testBot.createChat({ type: "group", title: "Test Group" });

      testBot.command("poll", async (ctx) => {
        await ctx.replyWithPoll("Vote?", ["Yes", "No"]);
      });

      const pollResponse = await testBot.sendCommand(user, chat, "/poll");
      const pollId = pollResponse.poll?.id ?? "";

      const voter = testBot.createUser({ first_name: "Voter" });

      // Vote
      await testBot.vote(voter, pollId, [0]);
      let poll = testBot.server.pollState.getPoll(pollId);
      expect(poll?.total_voter_count).toBe(1);

      // Retract vote (empty array)
      await testBot.vote(voter, pollId, []);
      poll = testBot.server.pollState.getPoll(pollId);
      expect(poll?.options[0].voter_count).toBe(0);
      expect(poll?.total_voter_count).toBe(0);
    });

    it("should handle multiple choice voting", async () => {
      const user = testBot.createUser({ first_name: "Ivy" });
      const chat = testBot.createChat({ type: "group", title: "Test Group" });

      testBot.command("multi", async (ctx) => {
        await ctx.replyWithPoll("Select all:", ["A", "B", "C", "D"], {
          allows_multiple_answers: true,
        });
      });

      const pollResponse = await testBot.sendCommand(user, chat, "/multi");
      const pollId = pollResponse.poll?.id ?? "";

      const voter = testBot.createUser({ first_name: "Voter" });

      // Vote for multiple options
      await testBot.vote(voter, pollId, [0, 2, 3]);

      const poll = testBot.server.pollState.getPoll(pollId);
      expect(poll?.options[0].voter_count).toBe(1);
      expect(poll?.options[1].voter_count).toBe(0);
      expect(poll?.options[2].voter_count).toBe(1);
      expect(poll?.options[3].voter_count).toBe(1);
      expect(poll?.total_voter_count).toBe(1); // Still 1 voter
    });
  });

  describe("Poll Answer Handler", () => {
    it("should trigger poll_answer handler", async () => {
      let receivedAnswer: { oderId: string; optionIds: number[] } | null = null;

      const user = testBot.createUser({ first_name: "Jack" });
      const chat = testBot.createChat({ type: "group", title: "Test Group" });

      testBot.command("poll", async (ctx) => {
        await ctx.replyWithPoll("Question?", ["A", "B"], { is_anonymous: false });
      });

      testBot.on("poll_answer", (ctx) => {
        receivedAnswer = {
          oderId: ctx.pollAnswer.poll_id,
          optionIds: ctx.pollAnswer.option_ids,
        };
      });

      const pollResponse = await testBot.sendCommand(user, chat, "/poll");
      const pollId = pollResponse.poll?.id ?? "";

      const voter = testBot.createUser({ first_name: "Voter" });
      await testBot.vote(voter, pollId, [1]);

      expect(receivedAnswer).toBeDefined();
      expect(receivedAnswer?.optionIds).toEqual([1]);
    });
  });

  describe("Stop Poll", () => {
    it("should stop a poll", async () => {
      const user = testBot.createUser({ first_name: "Kate" });
      const chat = testBot.createChat({ type: "group", title: "Test Group" });

      testBot.command("poll", async (ctx) => {
        const _msg = await ctx.replyWithPoll("Active poll", ["Yes", "No"]);
        // The message ID will be retrieved from the response
      });

      const pollResponse = await testBot.sendCommand(user, chat, "/poll");
      const messageId = pollResponse.messages[0]?.message_id;

      // Stop the poll
      testBot.command("stop", async (ctx) => {
        await ctx.api.stopPoll(chat.id, messageId ?? 0);
        await ctx.reply("Poll stopped.");
      });

      const stopResponse = await testBot.sendCommand(user, chat, "/stop");
      expect(stopResponse.text).toBe("Poll stopped.");

      // Check poll is closed
      expect(pollResponse.poll).toBeDefined();
      const poll = testBot.server.pollState.getPoll(pollResponse.poll.id);
      expect(poll?.is_closed).toBe(true);
    });
  });

  describe("Quiz Polls", () => {
    it("should track correct answers in quiz", async () => {
      const user = testBot.createUser({ first_name: "Leo" });
      const chat = testBot.createChat({ type: "group", title: "Test Group" });

      testBot.command("quiz", async (ctx) => {
        await ctx.replyWithPoll("2 + 2 = ?", ["3", "4", "5"], {
          type: "quiz",
          correct_option_id: 1,
        });
      });

      const quizResponse = await testBot.sendCommand(user, chat, "/quiz");
      expect(quizResponse.poll).toBeDefined();
      const pollId = quizResponse.poll?.id ?? "";

      // Correct answer
      const voter1 = testBot.createUser({ first_name: "Smart" });
      await testBot.vote(voter1, pollId, [1]);

      // Wrong answer
      const voter2 = testBot.createUser({ first_name: "Wrong" });
      await testBot.vote(voter2, pollId, [0]);

      const poll = testBot.server.pollState.getPoll(pollId);
      expect(poll?.options[1].voter_count).toBe(1); // Correct
      expect(poll?.options[0].voter_count).toBe(1); // Wrong
    });
  });
});
