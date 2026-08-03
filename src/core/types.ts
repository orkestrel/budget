/**
 * Options for constructing a cumulative budget.
 *
 * @remarks
 * `max` is a finite nonnegative ceiling. `consume` extracts the finite
 * nonnegative charge from each domain value. Omitted `id` values generate a
 * random UUID, and an optional native parent `signal` participates in the
 * exposed composite signal.
 *
 * @example
 * ```ts
 * const options: BudgetOptions<number> = { max: 100, consume: (value) => value }
 * ```
 */
export interface BudgetOptions<T> {
	/** Trace label for the budget; omission generates a random UUID. */
	readonly id?: string
	/** Finite nonnegative cumulative ceiling. */
	readonly max: number
	/** Extract the finite nonnegative charge from a consumed value. */
	readonly consume: (value: T) => number
	/** Native parent signal composed with the budget's owned exhaustion signal. */
	readonly signal?: AbortSignal
}

/**
 * A cumulative cost handle whose native signal aborts at its ceiling.
 *
 * @example
 * ```ts
 * const budget: BudgetInterface<number> = createBudget({
 * 	max: 100,
 * 	consume: (value) => value,
 * })
 * budget.consume(25)
 * ```
 */
export interface BudgetInterface<T> {
	/** Stable trace label. */
	readonly id: string
	/** Current native owned-or-parent-composed observation signal. */
	readonly signal: AbortSignal
	/** Validated finite nonnegative ceiling. */
	readonly max: number
	/** Cumulative finite nonnegative accepted charges. */
	readonly consumed: number
	/** Nonnegative headroom derived from `max` and `consumed`. */
	readonly remaining: number
	/** Whether the cumulative tally has reached or exceeded `max`. */
	readonly exhausted: boolean
	/**
	 * Re-arm a fresh signal without resetting the cumulative tally.
	 *
	 * @returns Nothing
	 */
	start(): void
	/**
	 * Validate and atomically add the charge extracted from a domain value.
	 *
	 * @param value - Domain value passed to the configured consumer
	 * @returns Nothing
	 */
	consume(value: T): void
	/**
	 * Reset the tally and re-arm a fresh signal.
	 *
	 * @returns Nothing
	 */
	clear(): void
}

/**
 * Token-usage field selected as the charge for a token budget.
 *
 * @example
 * ```ts
 * const scope: TokenScope = 'total'
 * ```
 */
export type TokenScope = 'completion' | 'total' | 'prompt'

/**
 * Options for constructing a token budget.
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
	/** Trace label for the budget; omission generates a random UUID. */
	readonly id?: string
	/** Finite nonnegative token ceiling. */
	readonly max: number
	/** Token usage field charged per provider response. */
	readonly scope?: TokenScope
	/** Native parent signal composed with the budget's owned exhaustion signal. */
	readonly signal?: AbortSignal
}

/**
 * Canonical finite nonnegative token counts reported for one provider call.
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
