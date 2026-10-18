import type { BudgetInterface, TokenScope, TokenUsage } from './types.js'
import {
	holds,
	isBoolean,
	isFiniteNumber,
	isFunction,
	isObject,
	isRecord,
	isString,
} from '@orkestrel/contract'

/**
 * Determines whether a value is a finite nonnegative budget amount.
 *
 * @param value - Unknown amount candidate
 * @returns True if the value is a finite nonnegative number; false otherwise
 *
 * @example
 * ```ts
 * isBudgetAmount(1.5) // true
 * isBudgetAmount(Number.NaN) // false
 * ```
 */
export function isBudgetAmount(value: unknown): value is number {
	return isFiniteNumber(value) && value >= 0
}

/**
 * Determines whether a value is a genuine native `AbortSignal`, returning `false`
 * rather than throwing on hostile input.
 *
 * @param value - Unknown signal candidate
 * @returns True if the intrinsic signal getter accepts the value; false otherwise
 *
 * @example
 * ```ts
 * isBudgetSignal(new AbortController().signal) // true
 * isBudgetSignal({ aborted: false }) // false
 * ```
 */
export function isBudgetSignal(value: unknown): value is AbortSignal {
	return holds(() => {
		const getter = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')?.get
		if (!isFunction(getter)) return false
		return isBoolean(Reflect.apply(getter, value, []))
	})
}

/**
 * Determines whether a value implements `BudgetInterface`, returning `false`
 * rather than throwing on hostile input.
 *
 * @remarks
 * Reads each member once inside a contained boundary: a string `id`, a native
 * `signal`, finite nonnegative `max`, `consumed`, and `remaining`, a boolean
 * `exhausted`, and callable `start`, `consume`, and `clear`. A class instance
 * passes; the guard checks the published contract and no more. It cannot verify
 * the reason a candidate's `signal` aborts with, so a candidate that aborts with
 * another reason than a `BudgetError` passes.
 *
 * @param value - Unknown budget candidate
 * @returns True if the value carries every `BudgetInterface` member; false otherwise
 *
 * @example
 * ```ts
 * isBudget(createBudget<number>({ max: 10, consumer: (value) => value })) // true
 * isBudget({ consume: () => undefined }) // false
 * ```
 */
export function isBudget(value: unknown): value is BudgetInterface<unknown> {
	if (!isObject(value)) return false
	return holds(
		() =>
			isString(Reflect.get(value, 'id')) &&
			isBudgetSignal(Reflect.get(value, 'signal')) &&
			isBudgetAmount(Reflect.get(value, 'max')) &&
			isBudgetAmount(Reflect.get(value, 'consumed')) &&
			isBudgetAmount(Reflect.get(value, 'remaining')) &&
			isBoolean(Reflect.get(value, 'exhausted')) &&
			isFunction(Reflect.get(value, 'start')) &&
			isFunction(Reflect.get(value, 'consume')) &&
			isFunction(Reflect.get(value, 'clear')),
	)
}

/**
 * Determines whether a value is a supported `TokenScope` field selector.
 *
 * @param value - Unknown scope candidate
 * @returns True if the value is `completion`, `total`, or `prompt`; false otherwise
 *
 * @example
 * ```ts
 * isTokenScope('total') // true
 * isTokenScope('input') // false
 * ```
 */
export function isTokenScope(value: unknown): value is TokenScope {
	return value === 'completion' || value === 'total' || value === 'prompt'
}

/**
 * Determines whether a value is readable token usage carrying three finite
 * nonnegative counts, returning `false` rather than throwing.
 *
 * @remarks
 * The read contains a hostile getter and a revoked proxy.
 *
 * @param value - Unknown usage candidate
 * @returns True if all three token counts are finite and nonnegative; false otherwise
 *
 * @example
 * ```ts
 * isTokenUsage({ prompt: 100, completion: 15, total: 115 }) // true
 * isTokenUsage({ prompt: 100, completion: -1, total: 99 }) // false
 * ```
 */
export function isTokenUsage(value: unknown): value is TokenUsage {
	if (!isRecord(value)) return false
	return holds(
		() =>
			isBudgetAmount(Reflect.get(value, 'prompt')) &&
			isBudgetAmount(Reflect.get(value, 'completion')) &&
			isBudgetAmount(Reflect.get(value, 'total')),
	)
}
