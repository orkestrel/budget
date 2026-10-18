import type { BudgetErrorContext } from './types.js'
import { isInstance } from '@orkestrel/contract'

/**
 * Reports a budget whose cumulative tally reached its ceiling — the abort reason of the budget's
 * own `signal`, carrying the machine-readable `code` `'exhaust'` and the budget's `id`, `max`, and
 * `consumed` readings.
 *
 * @remarks
 * A budget aborts with this error when `consume` brings `consumed` to `max` and when `start()` arms
 * a budget already at its ceiling; a parent signal's abort keeps the parent's own reason. The
 * reason reaches every `AbortSignal.any` composition unchanged, so a consumer narrows it with
 * {@link isBudgetError} wherever the bound is observed. The message is fixed; the readings are in
 * `context`.
 *
 * @example Trace an exhaustion
 * ```ts
 * import { createBudget, isBudgetError } from '@orkestrel/budget'
 *
 * const budget = createBudget<number>({ id: 'tokens', max: 10, consumer: (tokens) => tokens })
 * budget.consume(12)
 * const reason = budget.signal.reason
 * if (isBudgetError(reason)) reason.context // { id: 'tokens', max: 10, consumed: 12 }
 * ```
 */
export class BudgetError extends Error {
	/** Names the machine-readable condition — `'exhaust'`: the tally reached the ceiling. */
	readonly code = 'exhaust' as const
	/** Holds the exhausted budget's readings. */
	readonly context: BudgetErrorContext

	/**
	 * Creates the exhaustion reason from the budget's readings.
	 *
	 * @param context - The exhausted budget's `id`, `max`, and `consumed`
	 */
	constructor(context: BudgetErrorContext) {
		super('budget reached its ceiling')
		this.name = 'BudgetError'
		this.context = context
	}
}

/**
 * Narrows an unknown value to a {@link BudgetError} through `instanceof`, so an abort reason can
 * be read as a budget's exhaustion.
 *
 * @param value - The value to test (typically a `signal.reason`)
 * @returns True if `value` is a `BudgetError`; false otherwise
 *
 * @example
 * ```ts
 * isBudgetError(new BudgetError({ id: 'tokens', max: 10, consumed: 12 })) // true
 * isBudgetError(new DOMException('aborted', 'AbortError')) // false
 * ```
 */
export function isBudgetError(value: unknown): value is BudgetError {
	return isInstance(value, BudgetError)
}
