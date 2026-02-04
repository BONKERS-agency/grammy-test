import type { StarTransaction, User } from "grammy/types";

/**
 * Stored star transaction.
 */
export interface StoredStarTransaction {
  id: string;
  amount: number;
  date: number;
  source?: {
    type: "user";
    user: User;
  };
  receiver?: {
    type: "user";
    user: User;
  };
  /** Whether this transaction has been refunded */
  refunded: boolean;
  /** The Telegram payment charge ID for refunds */
  telegram_payment_charge_id?: string;
}

/**
 * Manages star transactions and refunds.
 */
export class PaymentState {
  /** Transactions by user ID -> transaction ID */
  private transactions = new Map<number, Map<string, StoredStarTransaction>>();

  /** Refunded transactions */
  private refundedTransactions = new Set<string>();

  /** Transaction ID counter */
  private transactionIdCounter = 1;

  /**
   * Create a star transaction (user pays bot).
   */
  createTransaction(
    userId: number,
    amount: number,
    options: {
      sourceUser?: User;
      receiverUser?: User;
    } = {},
  ): StoredStarTransaction {
    const userTransactions = this.getUserTransactions(userId);

    const transaction: StoredStarTransaction = {
      id: `star_tx_${this.transactionIdCounter++}`,
      amount,
      date: Math.floor(Date.now() / 1000),
      refunded: false,
    };

    if (options.sourceUser) {
      transaction.source = { type: "user", user: options.sourceUser };
    }
    if (options.receiverUser) {
      transaction.receiver = { type: "user", user: options.receiverUser };
    }

    // Generate a charge ID for potential refunds
    transaction.telegram_payment_charge_id = `charge_${transaction.id}`;

    userTransactions.set(transaction.id, transaction);
    return transaction;
  }

  /**
   * Get transactions for a user.
   */
  private getUserTransactions(userId: number): Map<string, StoredStarTransaction> {
    let transactions = this.transactions.get(userId);
    if (!transactions) {
      transactions = new Map();
      this.transactions.set(userId, transactions);
    }
    return transactions;
  }

  /**
   * Get star transactions for a user.
   */
  getStarTransactions(
    userId: number,
    options: {
      offset?: number;
      limit?: number;
    } = {},
  ): { transactions: StarTransaction[] } {
    const userTransactions = this.transactions.get(userId);
    if (!userTransactions) {
      return { transactions: [] };
    }

    const allTransactions = Array.from(userTransactions.values()).sort((a, b) => b.date - a.date); // Most recent first

    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    const sliced = allTransactions.slice(offset, offset + limit);

    return {
      transactions: sliced.map((tx) => this.toStarTransaction(tx)),
    };
  }

  /**
   * Refund a star payment.
   */
  refundStarPayment(userId: number, telegramPaymentChargeId: string): boolean {
    const userTransactions = this.transactions.get(userId);
    if (!userTransactions) return false;

    // Find the transaction by charge ID
    for (const [, tx] of userTransactions) {
      if (tx.telegram_payment_charge_id === telegramPaymentChargeId) {
        if (tx.refunded) {
          return false; // Already refunded
        }
        tx.refunded = true;
        this.refundedTransactions.add(tx.id);
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a transaction has been refunded.
   */
  isRefunded(transactionId: string): boolean {
    return this.refundedTransactions.has(transactionId);
  }

  /**
   * Get a specific transaction.
   */
  getTransaction(userId: number, transactionId: string): StoredStarTransaction | undefined {
    return this.transactions.get(userId)?.get(transactionId);
  }

  /**
   * Get transaction by charge ID.
   */
  getTransactionByChargeId(userId: number, chargeId: string): StoredStarTransaction | undefined {
    const userTransactions = this.transactions.get(userId);
    if (!userTransactions) return undefined;

    for (const [, tx] of userTransactions) {
      if (tx.telegram_payment_charge_id === chargeId) {
        return tx;
      }
    }
    return undefined;
  }

  /**
   * Convert stored transaction to Telegram StarTransaction type.
   */
  private toStarTransaction(stored: StoredStarTransaction): StarTransaction {
    return {
      id: stored.id,
      amount: stored.amount,
      date: stored.date,
      ...(stored.source ? { source: stored.source } : {}),
      ...(stored.receiver ? { receiver: stored.receiver } : {}),
    } as StarTransaction;
  }

  /**
   * Get total star balance for a user (sum of all non-refunded incoming transactions).
   */
  getStarBalance(userId: number): number {
    const userTransactions = this.transactions.get(userId);
    if (!userTransactions) return 0;

    let balance = 0;
    for (const [, tx] of userTransactions) {
      if (!tx.refunded) {
        balance += tx.amount;
      }
    }
    return balance;
  }

  /**
   * Reset all payment state.
   */
  reset(): void {
    this.transactions.clear();
    this.refundedTransactions.clear();
    this.transactionIdCounter = 1;
  }
}

/**
 * Create a new PaymentState instance.
 */
export function createPaymentState(): PaymentState {
  return new PaymentState();
}
