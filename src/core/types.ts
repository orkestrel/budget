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
	/**
	 * Holds the current native owned-or-parent-composed observation signal.
	 *
	 * @remarks
	 * The budget's own exhaustion aborts it with a `BudgetError` holding `{ id, max, consumed }`
	 * at the crossing, and a parent's abort keeps the parent's reason.
	 */
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
	 * @remarks
	 * A signal armed already aborted carries a `BudgetError` holding `{ id, max, consumed }` at the
	 * arming, unless an aborted parent supplies its own reason, which stays the parent's.
	 *
	 * @returns Nothing
	 */
	start(): void
	/**
	 * Runs the configured consumer first, then validates and atomically adds its
	 * charge, tripping `signal` the moment the tally reaches `max`; a valid charge
	 * that overshoots the ceiling is accepted.
	 *
	 * @remarks
	 * The trip aborts `signal` with a `BudgetError` holding `{ id, max, consumed }` at the
	 * crossing, unless a parent had already aborted, in which case the parent's reason stays.
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

/**
 * Represents the options for constructing a meter, accepted by the `Meter`
 * constructor.
 *
 * @remarks
 * `budget` is the cumulative budget each growth is consumed against.
 * `estimator` returns the finite nonnegative cost of the whole text measured so
 * far, and `producer` builds the budget value that charges one growth of that
 * cost.
 *
 * @example
 * ```ts
 * const options: MeterOptions<number> = {
 * 	budget: createBudget<number>({ max: 100, consumer: (tokens) => tokens }),
 * 	estimator: (text) => Math.ceil(text.length / 4),
 * 	producer: (charge) => charge,
 * }
 * ```
 */
export interface MeterOptions<T> {
	/** Holds the cumulative budget each growth is consumed against. */
	readonly budget: BudgetInterface<T>
	/** Returns the finite nonnegative cost of the whole text measured so far. */
	readonly estimator: (text: string) => number
	/** Builds the budget value that charges one growth of the estimated cost. */
	readonly producer: (charge: number) => T
}

/**
 * Represents the options for constructing a token meter, accepted by the
 * `createTokenMeter` function.
 *
 * @remarks
 * Both fields have the same strict runtime meaning as their `MeterOptions`
 * counterparts; the token meter supplies its own producer.
 *
 * @example
 * ```ts
 * const options: TokenMeterOptions = {
 * 	budget: createTokenBudget({ max: 1_000, scope: 'completion' }),
 * 	estimator: (text) => Math.ceil(text.length / 4),
 * }
 * ```
 */
export interface TokenMeterOptions {
	/** Holds the token budget each growth is consumed against. */
	readonly budget: BudgetInterface<TokenUsage>
	/** Returns the finite nonnegative token estimate of the whole text measured so far. */
	readonly estimator: (text: string) => number
}

/**
 * Represents the stream meter contract: it measures text as it streams and
 * charges a budget the growth of the text's estimated cost, keeping the cost
 * already charged so a later reported total can be reconciled against it.
 *
 * @example
 * ```ts
 * const meter: MeterInterface = createTokenMeter({
 * 	budget: createTokenBudget({ max: 1_000 }),
 * 	estimator: (text) => Math.ceil(text.length / 4),
 * })
 * meter.charge('hello')
 * ```
 */
export interface MeterInterface {
	/**
	 * Holds the total growth the budget accepted from this meter.
	 *
	 * @remarks
	 * A charge raises the value by its growth only after the budget's `consume` returns, so
	 * a charge in flight, and a charge the producer or the budget refused, add nothing. For
	 * a budget this meter alone charges and never clears, the value equals the budget's
	 * `consumed` whenever no charge is in flight, in serial use, under re-entry through the
	 * producer or the budget's consumer, and under refusal. A nested charge an abort listener
	 * makes is added before the outer charge, which the budget added first, so with growths
	 * that are not integers the two can differ in the last digit. In serial use the value
	 * equals the latest accepted estimate up to floating-point rounding.
	 */
	readonly charged: number
	/**
	 * Extends the measured text by one delta and charges the budget the growth of
	 * its estimated cost, charging nothing when the estimate does not grow.
	 *
	 * @param delta - Text streamed since the previous charge
	 * @returns Nothing
	 */
	charge(delta: string): void
}

/**
 * Represents the readings a `BudgetError` carries: the exhausted budget's trace `id`, its `max`
 * ceiling, and its `consumed` tally at the moment the ceiling was reached.
 *
 * @example
 * ```ts
 * const context: BudgetErrorContext = { id: 'tokens', max: 10, consumed: 12 }
 * ```
 */
export interface BudgetErrorContext {
	/** Holds the exhausted budget's trace label. */
	readonly id: string
	/** Holds the ceiling that was reached. */
	readonly max: number
	/** Holds the cumulative tally at the moment the ceiling was reached. */
	readonly consumed: number
}
