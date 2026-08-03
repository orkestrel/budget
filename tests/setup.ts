import type { ContractError } from '@orkestrel/contract'
import { isContractError } from '@orkestrel/contract'

/**
 * Capture the value thrown by an operation.
 *
 * @param operation - Operation expected to throw
 * @returns The exact thrown value
 * @throws {Error} When the operation completes without throwing
 *
 * @example
 * ```ts
 * const error = captureError(() => {
 * 	throw new Error('failed')
 * })
 * ```
 */
export function captureError(operation: () => unknown): unknown {
	try {
		operation()
	} catch (error) {
		return error
	}
	throw new Error('Expected the operation to throw')
}

/**
 * Capture and narrow a contract error thrown by an operation.
 *
 * @param operation - Operation expected to throw a contract error
 * @returns The narrowed contract error
 * @throws {Error} When the operation does not throw a contract error
 *
 * @example
 * ```ts
 * const error = captureContractError(() => createBudget({ max: -1, consume: Number }))
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

// ── Call recorder (a real callback, not a mock) ──────────────────────────────
//
// AGENTS §16.1: when a test only needs to count calls or inspect arguments, use a
// recorder — a real listener that records every invocation — rather than a test-
// framework spy. `handler` is a genuine callback; `calls` is each invocation's
// argument tuple, in order.

/** A real call-recording callback over an argument tuple (AGENTS §16.1). */
export interface TestRecorderInterface<TArgs extends readonly unknown[]> {
	readonly calls: readonly TArgs[]
	readonly count: number
	readonly handler: (...args: TArgs) => void
	clear(): void
}

/**
 * Create a {@link TestRecorderInterface} — a real callback that records each
 * invocation's arguments, for asserting what fired and with what (AGENTS §16.1).
 *
 * @typeParam TArgs - The argument tuple the recorded handler receives
 * @returns A recorder whose `handler` records into `calls`
 */
export function createRecorder<TArgs extends readonly unknown[]>(): TestRecorderInterface<TArgs> {
	const calls: TArgs[] = []
	return {
		get calls() {
			return calls
		},
		get count() {
			return calls.length
		},
		handler(...args: TArgs) {
			calls.push(args)
		},
		clear() {
			calls.length = 0
		},
	}
}

/** Whether a repository-relative Vue SFC path belongs to the private browser application. */
export function isBrowserVuePath(path: string): boolean {
	const normalized = path.replaceAll('\\', '/')
	return normalized.startsWith('app/browser/')
}
