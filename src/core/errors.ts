import type { BudgetErrorContext } from './types.js'
import { holds, INTRINSICS, isNumber, isObject, isString } from '@orkestrel/contract'
import { BUDGET_ERROR_BRAND } from './constants.js'

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
 * `context`. The constructor stamps {@link BUDGET_ERROR_BRAND} with the error itself, which
 * {@link isBudgetError} reads to recognize an error built by another copy of this package.
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
		INTRINSICS.define(this, BUDGET_ERROR_BRAND, { value: this, configurable: true })
		this.name = 'BudgetError'
		this.context = context
	}
}

/**
 * Checks whether an unknown value is a {@link BudgetError} built by any copy of this package, so an
 * abort reason can be read as a budget's exhaustion.
 *
 * @remarks
 * Recognition requires the native `Error` base, a prototype other than `Error.prototype`, an own
 * {@link BUDGET_ERROR_BRAND} descriptor whose value is the error itself, the
 * code `'exhaust'`, and a `context` holding a string `id` and number `max` and `consumed`. The
 * registry-global key makes recognition work across duplicate installations and across the ESM and
 * CommonJS entries, in both directions. The brand check compares identity, so a transparent proxy is
 * refused: its forwarded descriptor stores the target, not the proxy. An unbranded `Error` carrying
 * `code: 'exhaust'`, and an error from a copy that stamps no brand, such as 0.0.13, stay outside the
 * type. Subclass instances and renamed errors pass without reading `name`. The brand is a
 * recognition marker, not proof of origin: a complete look-alike that stamps its own identity under
 * the key passes. Unreadable required members or revoked input return `false` instead of throwing.
 *
 * @param value - The value to test (typically a `signal.reason`)
 * @returns True if `value` is a `BudgetError` from any copy of this package; false otherwise
 *
 * @example
 * ```ts
 * isBudgetError(new BudgetError({ id: 'tokens', max: 10, consumed: 12 })) // true
 * isBudgetError(new DOMException('aborted', 'AbortError')) // false
 * ```
 */
export function isBudgetError(value: unknown): value is BudgetError {
	if (!isObject(value)) return false
	return holds(() => {
		if (!(value instanceof INTRINSICS.error)) return false
		if (INTRINSICS.prototype(value) === INTRINSICS.error.prototype) return false
		if (INTRINSICS.describe(value, BUDGET_ERROR_BRAND)?.value !== value) return false
		if (INTRINSICS.reflect.read(value, 'code') !== 'exhaust') return false
		const context: unknown = INTRINSICS.reflect.read(value, 'context')
		return (
			isObject(context) &&
			isString(INTRINSICS.reflect.read(context, 'id')) &&
			isNumber(INTRINSICS.reflect.read(context, 'max')) &&
			isNumber(INTRINSICS.reflect.read(context, 'consumed'))
		)
	})
}
