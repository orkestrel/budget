/**
 * Represents the options for constructing a cumulative budget.
 *
 * @remarks
 * `max` is a finite nonnegative ceiling. `consumer` extracts the finite
 * nonnegative charge from each domain value. Omitted `id` values generate a
 * random UUID, and an optional native parent `signal` participates in the
 * exposed composite signal.
 *
 * @example
 * ```ts
 * const options: BudgetOptions<number> = { max: 100, consumer: (value) => value }
 * ```
 */
export interface BudgetOptions<T> {
	/** Holds the trace label for the budget; omission generates a random UUID. */
	readonly id?: string
	/** Holds the finite nonnegative cumulative ceiling. */
	readonly max: number
	/** Extracts the finite nonnegative charge from a consumed value. */
	readonly consumer: (value: T) => number
	/** Holds the native parent signal composed with the budget's owned exhaustion signal. */
	readonly signal?: AbortSignal
}

/**
 * Represents a cumulative cost handle whose native signal aborts at its ceiling.
 *
 * @example
 * ```ts
 * const budget: BudgetInterface<number> = createBudget({
 * 	max: 100,
 * 	consumer: (value) => value,
 * })
 * budget.consume(25)
 * ```
 */
export interface BudgetInterface<T> {
	/** Holds the stable trace label. */
	readonly id: string
	/** Holds the current native owned-or-parent-composed observation signal. */
	readonly signal: AbortSignal
	/** Holds the validated finite nonnegative ceiling. */
	readonly max: number
	/** Holds the cumulative finite nonnegative accepted charges. */
	readonly consumed: number
	/** Holds the nonnegative headroom derived from `max` and `consumed`. */
	readonly remaining: number
	/** Indicates whether the cumulative tally has reached or exceeded `max`. */
	readonly exhausted: boolean
	/**
	 * Re-arms a fresh signal without resetting the cumulative tally.
	 *
	 * @returns Nothing
	 */
	start(): void
	/**
	 * Validates and atomically adds the charge extracted from a domain value.
	 *
	 * @param value - Domain value passed to the configured consumer
	 * @returns Nothing
	 */
	consume(value: T): void
	/**
	 * Resets the tally and re-arms a fresh signal.
	 *
	 * @returns Nothing
	 */
	clear(): void
}

/**
 * Names the token-usage field selected as the charge for a token budget.
 *
 * @example
 * ```ts
 * const scope: TokenScope = 'total'
 * ```
 */
export type TokenScope = 'completion' | 'total' | 'prompt'

/**
 * Represents the options for constructing a token budget.
 *
 * @remarks
 * `scope` defaults to `completion`. All other fields have the same strict
 * runtime meaning as their `BudgetOptions` counterparts.
 *
 * @example
 * ```ts
 * const options: TokenBudgetOptions = { max: 50_000, scope: 'total' }
 * ```
 */
export interface TokenBudgetOptions {
	/** Holds the trace label for the budget; omission generates a random UUID. */
	readonly id?: string
	/** Holds the finite nonnegative token ceiling. */
	readonly max: number
	/** Names the token usage field charged per provider response. */
	readonly scope?: TokenScope
	/** Holds the native parent signal composed with the budget's owned exhaustion signal. */
	readonly signal?: AbortSignal
}

/**
 * Represents the canonical finite nonnegative token counts reported for one provider call.
 *
 * @example
 * ```ts
 * const usage: TokenUsage = { prompt: 100, completion: 15, total: 115 }
 * ```
 */
export interface TokenUsage {
	readonly prompt: number
	readonly completion: number
	readonly total: number
}
