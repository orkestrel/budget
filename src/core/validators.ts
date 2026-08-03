import type { TokenScope, TokenUsage } from './types.js'
import { isFiniteNumber, isRecord } from '@orkestrel/contract'

/**
 * Determine whether a value is a valid budget amount.
 *
 * @param value - Unknown amount candidate
 * @returns `true` only for a finite nonnegative number
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
 * Determine whether a value is a genuine native `AbortSignal`.
 *
 * @param value - Unknown signal candidate
 * @returns `true` only when the intrinsic signal getter accepts the value
 *
 * @example
 * ```ts
 * isBudgetSignal(new AbortController().signal) // true
 * isBudgetSignal({ aborted: false }) // false
 * ```
 */
export function isBudgetSignal(value: unknown): value is AbortSignal {
	try {
		const descriptor = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')
		if (descriptor?.get === undefined) return false
		return typeof Reflect.apply(descriptor.get, value, []) === 'boolean'
	} catch {
		return false
	}
}

/**
 * Determine whether a value selects a supported token usage field.
 *
 * @param value - Unknown scope candidate
 * @returns `true` for `completion`, `total`, or `prompt`
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
 * Determine whether a value is readable token usage with valid numeric fields.
 *
 * @remarks
 * Hostile getters and revoked proxies are contained and return `false`.
 *
 * @param value - Unknown usage candidate
 * @returns `true` only when all three token counts are finite and nonnegative
 *
 * @example
 * ```ts
 * isTokenUsage({ prompt: 100, completion: 15, total: 115 }) // true
 * isTokenUsage({ prompt: 100, completion: -1, total: 99 }) // false
 * ```
 */
export function isTokenUsage(value: unknown): value is TokenUsage {
	if (!isRecord(value)) return false
	try {
		return (
			isBudgetAmount(Reflect.get(value, 'prompt')) &&
			isBudgetAmount(Reflect.get(value, 'completion')) &&
			isBudgetAmount(Reflect.get(value, 'total'))
		)
	} catch {
		return false
	}
}
