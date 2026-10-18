import type { BudgetOptions, MeterOptions, TokenBudgetOptions, TokenMeterOptions } from './types.js'
import {
	ContractError,
	isFunction,
	isRecord,
	isString,
	preview,
	readValue,
} from '@orkestrel/contract'
import { isBudget, isBudgetAmount, isBudgetSignal, isTokenScope } from './validators.js'

/**
 * Validates and normalizes budget construction options into a fresh copy that
 * omits absent optional keys.
 *
 * @remarks
 * Each property is read exactly once before validation.
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

	const { id, max, consumer, signal } = readValue(
		() => ({
			id: options.id,
			max: options.max,
			consumer: options.consumer,
			signal: options.signal,
		}),
		'Budget',
		{
			subject: 'options',
			code: 'bound',
			context: {
				path: ['options'],
				limit: 'readable plain record',
				received: preview(options),
			},
		},
	)

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
 * Validates and normalizes token-budget construction options into a fresh copy
 * that omits absent optional keys.
 *
 * @remarks
 * Each property is read exactly once before validation.
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

	const { id, max, scope, signal } = readValue(
		() => ({
			id: options.id,
			max: options.max,
			scope: options.scope,
			signal: options.signal,
		}),
		'TokenBudget',
		{
			subject: 'options',
			code: 'bound',
			context: {
				path: ['options'],
				limit: 'readable plain record',
				received: preview(options),
			},
		},
	)

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

/**
 * Validates and normalizes meter construction options into a fresh copy.
 *
 * @remarks
 * Each property is read exactly once before validation.
 *
 * @param options - Potentially untrusted meter options
 * @returns A fresh validated `MeterOptions` object
 * @throws {@link import('@orkestrel/contract').ContractError} When the input
 *   does not satisfy `MeterOptions`
 *
 * @example
 * ```ts
 * const options = validateMeterOptions({
 * 	budget: createBudget<number>({ max: 100, consumer: (tokens) => tokens }),
 * 	estimator: (text) => Math.ceil(text.length / 4),
 * 	producer: (charge) => charge,
 * })
 * ```
 */
export function validateMeterOptions<T>(options: MeterOptions<T>): MeterOptions<T> {
	if (!isRecord(options)) {
		throw new ContractError('Meter: options must be a plain record', {
			code: 'bound',
			context: {
				path: ['options'],
				limit: 'plain record',
				received: preview(options),
			},
		})
	}

	const { budget, estimator, producer } = readValue(
		() => ({
			budget: options.budget,
			estimator: options.estimator,
			producer: options.producer,
		}),
		'Meter',
		{
			subject: 'options',
			code: 'bound',
			context: {
				path: ['options'],
				limit: 'readable plain record',
				received: preview(options),
			},
		},
	)

	if (!isBudget(budget)) {
		throw new ContractError('Meter: budget must implement BudgetInterface', {
			code: 'placement',
			context: {
				path: ['options', 'budget'],
				limit: 'BudgetInterface',
				received: preview(budget),
			},
		})
	}
	if (!isFunction(estimator)) {
		throw new ContractError('Meter: estimator must be a function', {
			code: 'placement',
			context: {
				path: ['options', 'estimator'],
				limit: 'function',
				received: preview(estimator),
			},
		})
	}
	if (!isFunction(producer)) {
		throw new ContractError('Meter: producer must be a function', {
			code: 'placement',
			context: {
				path: ['options', 'producer'],
				limit: 'function',
				received: preview(producer),
			},
		})
	}

	return { budget, estimator, producer }
}

/**
 * Validates and normalizes token-meter construction options into a fresh copy.
 *
 * @remarks
 * Each property is read exactly once before validation.
 *
 * @param options - Potentially untrusted token-meter options
 * @returns A fresh validated `TokenMeterOptions` object
 * @throws {@link import('@orkestrel/contract').ContractError} When the input
 *   does not satisfy `TokenMeterOptions`
 *
 * @example
 * ```ts
 * const options = validateTokenMeterOptions({
 * 	budget: createTokenBudget({ max: 1_000 }),
 * 	estimator: (text) => Math.ceil(text.length / 4),
 * })
 * ```
 */
export function validateTokenMeterOptions(options: TokenMeterOptions): TokenMeterOptions {
	if (!isRecord(options)) {
		throw new ContractError('TokenMeter: options must be a plain record', {
			code: 'bound',
			context: {
				path: ['options'],
				limit: 'plain record',
				received: preview(options),
			},
		})
	}

	const { budget, estimator } = readValue(
		() => ({
			budget: options.budget,
			estimator: options.estimator,
		}),
		'TokenMeter',
		{
			subject: 'options',
			code: 'bound',
			context: {
				path: ['options'],
				limit: 'readable plain record',
				received: preview(options),
			},
		},
	)

	if (!isBudget(budget)) {
		throw new ContractError('TokenMeter: budget must implement BudgetInterface', {
			code: 'placement',
			context: {
				path: ['options', 'budget'],
				limit: 'BudgetInterface',
				received: preview(budget),
			},
		})
	}
	if (!isFunction(estimator)) {
		throw new ContractError('TokenMeter: estimator must be a function', {
			code: 'placement',
			context: {
				path: ['options', 'estimator'],
				limit: 'function',
				received: preview(estimator),
			},
		})
	}

	return { budget, estimator }
}
