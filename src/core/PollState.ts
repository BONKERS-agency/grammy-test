import type { Poll } from "grammy/types";

/**
 * Stored vote information.
 */
export interface StoredVote {
  userId: number;
  optionIds: number[];
  timestamp: number;
}

/**
 * Stored poll data.
 */
export interface StoredPoll {
  poll: Poll;
  /** Chat ID where the poll was created */
  chatId: number;
  /** Message ID of the poll message */
  messageId: number;
  /** All votes for this poll */
  votes: Map<number, StoredVote>;
  /** Creator of the poll */
  creatorId: number;
  /** Whether the poll has been stopped */
  isStopped: boolean;
}

/**
 * Manages poll state including creation, voting, and closing.
 */
export class PollState {
  /** Map of pollId -> poll data */
  private polls = new Map<string, StoredPoll>();

  /** Map of chatId -> messageId -> pollId */
  private pollsByMessage = new Map<number, Map<number, string>>();

  /** Simulated current time */
  private currentTime: number = Date.now();

  /**
   * Get the current simulated time.
   */
  getCurrentTime(): number {
    return this.currentTime;
  }

  /**
   * Set the current simulated time.
   */
  setCurrentTime(time: number): void {
    this.currentTime = time;
  }

  /**
   * Advance time by a number of seconds.
   */
  advanceTime(seconds: number): void {
    this.currentTime += seconds * 1000;
  }

  /**
   * Get current Unix timestamp.
   */
  private timestamp(): number {
    return Math.floor(this.currentTime / 1000);
  }

  /**
   * Get the total number of polls created.
   */
  getPollCount(): number {
    return this.polls.size;
  }

  // === Poll Management ===

  /**
   * Store a new poll.
   */
  createPoll(poll: Poll, chatId: number, messageId: number, creatorId: number): StoredPoll {
    const stored: StoredPoll = {
      poll: { ...poll },
      chatId,
      messageId,
      votes: new Map(),
      creatorId,
      isStopped: false,
    };

    this.polls.set(poll.id, stored);

    // Index by message
    let chatPolls = this.pollsByMessage.get(chatId);
    if (!chatPolls) {
      chatPolls = new Map();
      this.pollsByMessage.set(chatId, chatPolls);
    }
    chatPolls.set(messageId, poll.id);

    return stored;
  }

  /**
   * Get stored poll data by ID.
   */
  getStoredPoll(pollId: string): StoredPoll | undefined {
    return this.polls.get(pollId);
  }

  /**
   * Get a poll by ID (returns the Poll object directly for convenience).
   */
  getPoll(pollId: string): Poll | undefined {
    return this.polls.get(pollId)?.poll;
  }

  /**
   * Get a poll by message.
   */
  getPollByMessage(chatId: number, messageId: number): StoredPoll | undefined {
    const pollId = this.pollsByMessage.get(chatId)?.get(messageId);
    return pollId ? this.polls.get(pollId) : undefined;
  }

  /**
   * Check if a poll is closed (stopped or expired).
   */
  isPollClosed(pollId: string): boolean {
    const stored = this.polls.get(pollId);
    if (!stored) return true;

    if (stored.isStopped || stored.poll.is_closed) return true;

    // Check if close_date has passed
    if (stored.poll.close_date && stored.poll.close_date < this.timestamp()) {
      stored.poll.is_closed = true;
      stored.isStopped = true;
      return true;
    }

    return false;
  }

  // === Voting ===

  /**
   * Vote on a poll.
   * @returns Updated poll if successful, undefined if failed
   */
  vote(pollId: string, userId: number, optionIds: number[]): Poll | undefined {
    const stored = this.polls.get(pollId);
    if (!stored || this.isPollClosed(pollId)) return undefined;

    const poll = stored.poll;

    // Validate options (empty array is valid for retraction)
    if (!poll.allows_multiple_answers && optionIds.length > 1) return undefined;
    for (const optionId of optionIds) {
      if (optionId < 0 || optionId >= poll.options.length) return undefined;
    }

    // Get existing vote
    const existingVote = stored.votes.get(userId);

    // Remove previous votes from counts
    if (existingVote) {
      for (const optionId of existingVote.optionIds) {
        poll.options[optionId].voter_count--;
      }
      poll.total_voter_count--;
    }

    // If optionIds is empty, this is a retraction
    if (optionIds.length === 0) {
      stored.votes.delete(userId);
      return poll;
    }

    // Add new votes
    for (const optionId of optionIds) {
      poll.options[optionId].voter_count++;
    }
    poll.total_voter_count++;

    // Store the vote
    stored.votes.set(userId, {
      userId,
      optionIds,
      timestamp: this.timestamp(),
    });

    return poll;
  }

  /**
   * Get a user's vote on a poll.
   */
  getVote(pollId: string, userId: number): StoredVote | undefined {
    return this.polls.get(pollId)?.votes.get(userId);
  }

  /**
   * Get all votes for a poll.
   */
  getAllVotes(pollId: string): StoredVote[] {
    const stored = this.polls.get(pollId);
    return stored ? Array.from(stored.votes.values()) : [];
  }

  /**
   * Get voter count for a specific option.
   */
  getOptionVoterCount(pollId: string, optionId: number): number {
    const stored = this.polls.get(pollId);
    if (!stored || optionId < 0 || optionId >= stored.poll.options.length) {
      return 0;
    }
    return stored.poll.options[optionId].voter_count;
  }

  // === Quiz Mode ===

  /**
   * Check if a user's answer to a quiz is correct.
   */
  isCorrectAnswer(pollId: string, userId: number): boolean | undefined {
    const stored = this.polls.get(pollId);
    if (!stored || stored.poll.type !== "quiz") return undefined;

    const vote = stored.votes.get(userId);
    if (!vote) return undefined;

    const correctOptionId = stored.poll.correct_option_id;
    if (correctOptionId === undefined) return undefined;

    return vote.optionIds.includes(correctOptionId);
  }

  // === Poll Lifecycle ===

  /**
   * Stop a poll.
   */
  stopPoll(pollId: string): Poll | undefined {
    const stored = this.polls.get(pollId);
    if (!stored || stored.isStopped) return undefined;

    stored.isStopped = true;
    stored.poll.is_closed = true;

    return stored.poll;
  }

  /**
   * Stop a poll by message.
   */
  stopPollByMessage(chatId: number, messageId: number): Poll | undefined {
    const pollId = this.pollsByMessage.get(chatId)?.get(messageId);
    if (!pollId) return undefined;
    return this.stopPoll(pollId);
  }

  // === State Management ===

  /**
   * Delete a poll.
   */
  deletePoll(pollId: string): boolean {
    const stored = this.polls.get(pollId);
    if (!stored) return false;

    // Remove from message index
    const chatPolls = this.pollsByMessage.get(stored.chatId);
    if (chatPolls) {
      chatPolls.delete(stored.messageId);
      if (chatPolls.size === 0) {
        this.pollsByMessage.delete(stored.chatId);
      }
    }

    return this.polls.delete(pollId);
  }

  /**
   * Delete all polls in a chat.
   */
  deleteChatPolls(chatId: number): void {
    const chatPolls = this.pollsByMessage.get(chatId);
    if (chatPolls) {
      for (const pollId of chatPolls.values()) {
        this.polls.delete(pollId);
      }
      this.pollsByMessage.delete(chatId);
    }
  }

  /**
   * Reset all poll state.
   */
  reset(): void {
    this.polls.clear();
    this.pollsByMessage.clear();
    this.currentTime = Date.now();
  }

  /**
   * Get all polls (for debugging/testing).
   */
  getAllPolls(): StoredPoll[] {
    return Array.from(this.polls.values());
  }
}

/**
 * Create a new PollState instance.
 */
export function createPollState(): PollState {
  return new PollState();
}
