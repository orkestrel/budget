/** Options for `createBudget`. */
export interface BudgetOptions<T> {
	readonly id?: string
	/** Hard ceiling — once cumulative `consumed` reaches this, `signal` fires. */
	readonly max: number
	/** Extracts the numeric amount to charge from a domain value (e.g. tokens). */
	readonly consume: (value: T) => number
	/** A parent signal — the budget's `signal` also fires when this aborts. */
	readonly signal?: AbortSignal
}

/**
 * A cost handle — a running tally against `max` whose `AbortSignal` fires when the
 * ceiling is reached, for racing against work exactly like a `Timeout` deadline.
 */
export interface BudgetInterface<T> {
	readonly id: string
	readonly signal: AbortSignal
	readonly max: number
	readonly consumed: number
	readonly remaining: number
	readonly exhausted: boolean
	start(): void
	consume(value: T): void
	clear(): void
}

/** Options for `createTokenBudget`. */
export interface TokenBudgetOptions {
	readonly id?: string
	/** Hard token ceiling — once cumulative spend reaches this, `signal` fires. */
	readonly max: number
	/** Which `TokenUsage` field to charge per call — `'completion'` by default. */
	readonly scope?: 'completion' | 'total' | 'prompt'
	/** A parent signal — the budget's `signal` also fires when this aborts. */
	readonly signal?: AbortSignal
}

/** Canonical LLM cost unit — the typical `T` for an agent budget. */
export interface TokenUsage {
	readonly prompt: number
	readonly completion: number
	readonly total: number
}
