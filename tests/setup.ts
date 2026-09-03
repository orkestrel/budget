import type { ContractError } from '@orkestrel/contract'
import type { TokenUsage } from '@src/core'
import { isContractError } from '@orkestrel/contract'
import { captureError } from '@orkestrel/test'

/**
 * Capture and narrow a contract error thrown by an operation.
 *
 * @param operation - Operation expected to throw a contract error
 * @returns The narrowed contract error
 * @throws {Error} When the operation does not throw a contract error
 *
 * @example
 * ```ts
 * const error = captureContractError(() => createBudget({ max: -1, consumer: Number }))
 * ```
 */
export function captureContractError(operation: () => unknown): ContractError {
	const error = captureError(operation)
	if (!isContractError(error)) throw new Error('Expected a ContractError')
	return error
}

/**
 * Select a numeric value itself as a budget charge.
 *
 * @param value - Numeric value to select
 * @returns The unchanged value
 *
 * @example
 * ```ts
 * selectCharge(5) // 5
 * ```
 */
export function selectCharge(value: number): number {
	return value
}

/**
 * Creates a token usage record from its three counts.
 *
 * @param prompt - Prompt token count
 * @param completion - Completion token count
 * @param total - Total token count
 * @returns The token usage record
 *
 * @example
 * ```ts
 * createTokenUsage(100, 15, 115) // { prompt: 100, completion: 15, total: 115 }
 * ```
 */
export function createTokenUsage(prompt: number, completion: number, total: number): TokenUsage {
	return { prompt, completion, total }
}

/**
 * Creates a proxy that records every property read off a target, in read order.
 *
 * @remarks
 * `reads` is the live log the proxy appends to, never a snapshot, so a read that
 * happens after this helper returns is visible through it.
 *
 * @param target - Object whose property reads are recorded
 * @returns The proxy to hand to the code under test and the live read log
 *
 * @example
 * ```ts
 * const { proxy, reads } = createReadingProxy({ max: 10 })
 * proxy.max // reads is ['max']
 * ```
 */
export function createReadingProxy<T extends object>(
	target: T,
): { readonly proxy: T; readonly reads: readonly PropertyKey[] } {
	const reads: PropertyKey[] = []
	const proxy = new Proxy(target, {
		get(subject, property, receiver) {
			reads.push(property)
			return Reflect.get(subject, property, receiver)
		},
	})
	return { proxy, reads }
}

/**
 * Defines, in place on the target it receives, a property whose every read throws.
 *
 * @remarks
 * The installed descriptor is the native `AbortSignal.prototype.aborted` getter, which
 * throws a real `TypeError` when read through a receiver that is not an `AbortSignal`.
 *
 * @param target - Object that receives the throwing property; the call mutates it
 * @param key - Property name that throws on read
 * @returns The same target object, mutated in place with the throwing property installed
 * @throws {Error} When the native `aborted` descriptor is absent
 *
 * @example
 * ```ts
 * const options = defineThrowingProperty({ consumer: selectCharge }, 'max')
 * ```
 */
export function defineThrowingProperty<T extends object>(target: T, key: string): T {
	const descriptor = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')
	if (descriptor === undefined) throw new Error('Expected the native aborted descriptor')
	Object.defineProperty(target, key, descriptor)
	return target
}
