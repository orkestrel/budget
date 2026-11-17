import type { BudgetOptions, MeterOptions, TokenBudgetOptions, TokenMeterOptions } from './types.js'
import {
	isFunction,
	isRecord,
	isString,
	optionalOf,
	preview,
	readValue,
	refuseValue,
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
	refuseValue(options, isRecord, 'Budget', {
		path: ['options'],
		limit: 'plain record',
		code: 'bound',
	})

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

	refuseValue(id, optionalOf(isString), 'Budget', {
		path: ['options', 'id'],
		limit: 'string or undefined',
		code: 'literal',
	})
	refuseValue(max, isBudgetAmount, 'Budget', {
		path: ['options', 'max'],
		limit: 'finite nonnegative number',
		code: 'range',
	})
	refuseValue(consumer, isFunction, 'Budget', {
		path: ['options', 'consumer'],
		limit: 'function',
		code: 'placement',
	})
	refuseValue(signal, optionalOf(isBudgetSignal), 'Budget', {
		path: ['options', 'signal'],
		limit: 'native AbortSignal or undefined',
		code: 'placement',
	})

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
	refuseValue(options, isRecord, 'TokenBudget', {
		path: ['options'],
		limit: 'plain record',
		code: 'bound',
	})

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

	refuseValue(id, optionalOf(isString), 'TokenBudget', {
		path: ['options', 'id'],
		limit: 'string or undefined',
		code: 'literal',
	})
	refuseValue(max, isBudgetAmount, 'TokenBudget', {
		path: ['options', 'max'],
		limit: 'finite nonnegative number',
		code: 'range',
	})
	refuseValue(scope, optionalOf(isTokenScope), 'TokenBudget', {
		path: ['options', 'scope'],
		limit: "'completion' | 'total' | 'prompt' or undefined",
		code: 'literal',
	})
	refuseValue(signal, optionalOf(isBudgetSignal), 'TokenBudget', {
		path: ['options', 'signal'],
		limit: 'native AbortSignal or undefined',
		code: 'placement',
	})

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
	refuseValue(options, isRecord, 'Meter', {
		path: ['options'],
		limit: 'plain record',
		code: 'bound',
	})

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

	refuseValue(budget, isBudget, 'Meter', {
		path: ['options', 'budget'],
		limit: 'BudgetInterface',
		code: 'placement',
	})
	refuseValue(estimator, isFunction, 'Meter', {
		path: ['options', 'estimator'],
		limit: 'function',
		code: 'placement',
	})
	refuseValue(producer, isFunction, 'Meter', {
		path: ['options', 'producer'],
		limit: 'function',
		code: 'placement',
	})

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
	refuseValue(options, isRecord, 'TokenMeter', {
		path: ['options'],
		limit: 'plain record',
		code: 'bound',
	})

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

	refuseValue(budget, isBudget, 'TokenMeter', {
		path: ['options', 'budget'],
		limit: 'BudgetInterface',
		code: 'placement',
	})
	refuseValue(estimator, isFunction, 'TokenMeter', {
		path: ['options', 'estimator'],
		limit: 'function',
		code: 'placement',
	})

	return { budget, estimator }
}
