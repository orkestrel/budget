import type { BudgetOptions, TokenBudgetOptions } from './types.js'
import { ContractError, isFunction, isRecord, isString, preview } from '@orkestrel/contract'
import { isBudgetAmount, isBudgetSignal, isTokenScope } from './validators.js'

/**
 * Validates and normalizes budget construction options.
 *
 * @remarks
 * Each property is read exactly once before validation. The returned object is
 * a fresh copy and omits absent optional properties.
 *
 * @param options - Potentially untrusted budget options
 * @returns A fresh validated `BudgetOptions` object
 * @throws {@link import('@orkestrel/contract').ContractError} When the input
 *   does not satisfy `BudgetOptions`
 *
 * @example
 * ```ts
 * const options = validateBudgetOptions({ max: 100, consumer: (value: number) => value })
 * ```
 */
export function validateBudgetOptions<T>(options: BudgetOptions<T>): BudgetOptions<T> {
	if (!isRecord(options)) {
		throw new ContractError('Budget: options must be a plain record', {
			code: 'bound',
			context: {
				path: ['options'],
				limit: 'plain record',
				received: preview(options),
			},
		})
	}

	let id: BudgetOptions<T>['id']
	let max: BudgetOptions<T>['max']
	let consumer: BudgetOptions<T>['consumer']
	let signal: BudgetOptions<T>['signal']
	try {
		id = options.id
		max = options.max
		consumer = options.consumer
		signal = options.signal
	} catch (cause) {
		throw new ContractError('Budget: options could not be read', {
			code: 'bound',
			context: {
				path: ['options'],
				limit: 'readable plain record',
				received: preview(options),
			},
			cause,
		})
	}

	if (id !== undefined && !isString(id)) {
		throw new ContractError('Budget: id must be a string when defined', {
			code: 'literal',
			context: {
				path: ['options', 'id'],
				limit: 'string or undefined',
				received: preview(id),
			},
		})
	}
	if (!isBudgetAmount(max)) {
		throw new ContractError('Budget: max must be finite and nonnegative', {
			code: 'range',
			context: {
				path: ['options', 'max'],
				limit: 'finite nonnegative number',
				received: preview(max),
			},
		})
	}
	if (!isFunction(consumer)) {
		throw new ContractError('Budget: consumer must be a function', {
			code: 'placement',
			context: {
				path: ['options', 'consumer'],
				limit: 'function',
				received: preview(consumer),
			},
		})
	}
	if (signal !== undefined && !isBudgetSignal(signal)) {
		throw new ContractError('Budget: signal must be a native AbortSignal when defined', {
			code: 'placement',
			context: {
				path: ['options', 'signal'],
				limit: 'native AbortSignal or undefined',
				received: preview(signal),
			},
		})
	}

	if (id !== undefined && signal !== undefined) return { id, max, consumer, signal }
	if (id !== undefined) return { id, max, consumer }
	if (signal !== undefined) return { max, consumer, signal }
	return { max, consumer }
}

/**
 * Validates and normalizes token-budget construction options.
 *
 * @remarks
 * Each property is read exactly once before validation. The returned object is
 * a fresh copy and omits absent optional properties.
 *
 * @param options - Potentially untrusted token-budget options
 * @returns A fresh validated `TokenBudgetOptions` object
 * @throws {@link import('@orkestrel/contract').ContractError} When the input
 *   does not satisfy `TokenBudgetOptions`
 *
 * @example
 * ```ts
 * const options = validateTokenBudgetOptions({ max: 50_000, scope: 'total' })
 * ```
 */
export function validateTokenBudgetOptions(options: TokenBudgetOptions): TokenBudgetOptions {
	if (!isRecord(options)) {
		throw new ContractError('TokenBudget: options must be a plain record', {
			code: 'bound',
			context: {
				path: ['options'],
				limit: 'plain record',
				received: preview(options),
			},
		})
	}

	let id: TokenBudgetOptions['id']
	let max: TokenBudgetOptions['max']
	let scope: TokenBudgetOptions['scope']
	let signal: TokenBudgetOptions['signal']
	try {
		id = options.id
		max = options.max
		scope = options.scope
		signal = options.signal
	} catch (cause) {
		throw new ContractError('TokenBudget: options could not be read', {
			code: 'bound',
			context: {
				path: ['options'],
				limit: 'readable plain record',
				received: preview(options),
			},
			cause,
		})
	}

	if (id !== undefined && !isString(id)) {
		throw new ContractError('TokenBudget: id must be a string when defined', {
			code: 'literal',
			context: {
				path: ['options', 'id'],
				limit: 'string or undefined',
				received: preview(id),
			},
		})
	}
	if (!isBudgetAmount(max)) {
		throw new ContractError('TokenBudget: max must be finite and nonnegative', {
			code: 'range',
			context: {
				path: ['options', 'max'],
				limit: 'finite nonnegative number',
				received: preview(max),
			},
		})
	}
	if (scope !== undefined && !isTokenScope(scope)) {
		throw new ContractError('TokenBudget: scope is not supported', {
			code: 'literal',
			context: {
				path: ['options', 'scope'],
				limit: "'completion' | 'total' | 'prompt' or undefined",
				received: preview(scope),
			},
		})
	}
	if (signal !== undefined && !isBudgetSignal(signal)) {
		throw new ContractError('TokenBudget: signal must be native when defined', {
			code: 'placement',
			context: {
				path: ['options', 'signal'],
				limit: 'native AbortSignal or undefined',
				received: preview(signal),
			},
		})
	}

	if (id !== undefined && scope !== undefined && signal !== undefined) {
		return { id, max, scope, signal }
	}
	if (id !== undefined && scope !== undefined) return { id, max, scope }
	if (id !== undefined && signal !== undefined) return { id, max, signal }
	if (scope !== undefined && signal !== undefined) return { max, scope, signal }
	if (id !== undefined) return { id, max }
	if (scope !== undefined) return { max, scope }
	if (signal !== undefined) return { max, signal }
	return { max }
}
