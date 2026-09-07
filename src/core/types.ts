/**
 * Represents the options for constructing a cumulative budget, accepted by the
 * `createBudget` function and the `Budget` constructor.
 *
 * @remarks
 * `max` is a finite nonnegative ceiling. `consumer` extracts the finite
 * nonnegative charge from each domain value. An optional native parent `signal`
 * participates in the exposed composite signal.
 *
 * @example
 * ```ts
 * const options: BudgetOptions<number> = { max: 100, consumer: (value) => value }
 * ```
 */
export interface BudgetOptions<T> {
	/** Holds the trace label for the budget. Default: a random UUID. */
	readonly id?: string
	/** Holds the finite nonnegative cumulative ceiling. */
	readonly max: number
	/** Extracts the finite nonnegative charge from a consumed value. */
	readonly consumer: (value: T) => number
	/** Holds the native parent signal composed with the budget's owned exhaustion signal. */
	readonly signal?: AbortSignal
}

/**
 * Represents the cumulative cost handle contract: a lifetime tally, its validated
 * ceiling, and the native signal that aborts when the tally reaches that ceiling.
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
	 * Re-arms a fresh per-request `signal` without resetting the cumulative tally,
	 * arming it already aborted when `consumed` has reached `max`.
	 *
	 * @returns Nothing
	 */
	start(): void
	/**
	 * Runs the configured consumer first, then validates and atomically adds its
	 * charge, tripping `signal` the moment the tally reaches `max`; a valid charge
	 * that overshoots the ceiling is accepted.
	 *
	 * @param value - Domain value passed to the configured consumer
	 * @returns Nothing
	 */
	consume(value: T): void
	/**
	 * Resets the tally to `0` and re-arms a fresh unaborted `signal`, opening the
	 * next window from zero.
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
 * Represents the options for constructing a token budget, accepted by the
 * `createTokenBudget` function.
 *
 * @remarks
 * `scope` — Default: `completion`. All other fields have the same strict
 * runtime meaning as their `BudgetOptions` counterparts.
 *
 * @example
 * ```ts
 * const options: TokenBudgetOptions = { max: 50_000, scope: 'total' }
 * ```
 */
export interface TokenBudgetOptions {
	/** Holds the trace label for the budget. Default: a random UUID. */
	readonly id?: string
	/** Holds the finite nonnegative token ceiling. */
	readonly max: number
	/** Names the token usage field charged per provider response. Default: `completion`. */
	readonly scope?: TokenScope
	/** Holds the native parent signal composed with the budget's owned exhaustion signal. */
	readonly signal?: AbortSignal
}

/**
 * Represents the canonical LLM cost unit: the finite nonnegative token counts
 * reported for one provider call, and the typical `T` for an agent budget.
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
