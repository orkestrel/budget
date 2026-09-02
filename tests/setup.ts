import type { ContractError } from '@orkestrel/contract'
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

/** Whether a repository-relative Vue SFC path belongs to the private browser application. */
export function isBrowserVuePath(path: string): boolean {
	const normalized = path.replaceAll('\\', '/')
	return normalized.startsWith('app/browser/')
}
