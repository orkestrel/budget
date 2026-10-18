import type { BudgetOptions, MeterOptions, TokenBudgetOptions, TokenMeterOptions } from '@src/core'
import {
	createTokenBudget,
	validateBudgetOptions,
	validateMeterOptions,
	validateTokenBudgetOptions,
	validateTokenMeterOptions,
} from '@src/core'
import { preview } from '@orkestrel/contract'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
	ReadingProxy,
	captureContractError,
	createRecordingBudget,
	defineThrowingProperty,
	selectCharge,
	selectLength,
} from '../../setup.js'

describe('validateBudgetOptions', () => {
	it('returns a fresh copy and omits absent optional keys', () => {
		const input: BudgetOptions<number> = { max: 10, consumer: selectCharge }
		const output = validateBudgetOptions(input)

		expect(output).not.toBe(input)
		expect(output).toEqual(input)
		expect(Object.hasOwn(output, 'id')).toBe(false)
		expect(Object.hasOwn(output, 'signal')).toBe(false)
	})

	it('preserves present optional keys in a fresh copy', () => {
		const signal = new AbortController().signal
		const input: BudgetOptions<number> = {
			id: '',
			max: 10,
			consumer: selectCharge,
			signal,
		}
		const output = validateBudgetOptions(input)

		expect(output).not.toBe(input)
		expect(output).toEqual(input)
		expect(Object.hasOwn(output, 'id')).toBe(true)
		expect(Object.hasOwn(output, 'signal')).toBe(true)
	})

	it('reads each declared property exactly once', () => {
		const { proxy, reads } = new ReadingProxy<BudgetOptions<number>>({
			id: 'meter',
			max: 10,
			consumer: selectCharge,
			signal: new AbortController().signal,
		})

		const output = validateBudgetOptions(proxy)

		expect(output.id).toBe('meter')
		expect(reads).toEqual(['id', 'max', 'consumer', 'signal'])
	})

	it('contains a hostile getter and preserves its cause', () => {
		const input = defineThrowingProperty({ consumer: selectCharge }, 'max')
		const error = captureContractError(() =>
			Reflect.apply(validateBudgetOptions, undefined, [input]),
		)

		expect(error.code).toBe('bound')
		expect(error.context).toEqual({
			path: ['options'],
			limit: 'readable plain record',
			received: 'object',
		})
		expect(error.cause instanceof TypeError).toBe(true)
	})

	it.each([
		['options', null, 'bound', ['options'], 'plain record', preview(null)],
		[
			'id',
			{ id: 1, max: 10, consumer: selectCharge },
			'literal',
			['options', 'id'],
			'string or undefined',
			'1',
		],
		[
			'max',
			{ max: Number.POSITIVE_INFINITY, consumer: selectCharge },
			'range',
			['options', 'max'],
			'finite nonnegative number',
			'Infinity',
		],
		['consumer', { max: 10, consumer: 1 }, 'placement', ['options', 'consumer'], 'function', '1'],
		[
			'signal',
			{ max: 10, consumer: selectCharge, signal: { aborted: false } },
			'placement',
			['options', 'signal'],
			'native AbortSignal or undefined',
			'object',
		],
	])(
		'rejects invalid %s with exact contract context',
		(_field, input, code, path, limit, received) => {
			const error = captureContractError(() =>
				Reflect.apply(validateBudgetOptions, undefined, [input]),
			)

			expect(error.code).toBe(code)
			expect(error.context).toEqual({ path, limit, received })
		},
	)

	it('preserves the generic consumer type', () => {
		expectTypeOf(validateBudgetOptions<number>).returns.toEqualTypeOf<BudgetOptions<number>>()
	})
})

describe('validateTokenBudgetOptions', () => {
	it('returns a fresh copy and omits absent optional keys', () => {
		const input: TokenBudgetOptions = { max: 10 }
		const output = validateTokenBudgetOptions(input)

		expect(output).not.toBe(input)
		expect(output).toEqual(input)
		expect(Object.keys(output)).toEqual(['max'])
	})

	it('preserves every present optional key in a fresh copy', () => {
		const signal = new AbortController().signal
		const input: TokenBudgetOptions = { id: '', max: 10, scope: 'total', signal }
		const output = validateTokenBudgetOptions(input)

		expect(output).not.toBe(input)
		expect(output).toEqual(input)
		expect(Object.keys(output)).toEqual(['id', 'max', 'scope', 'signal'])
	})

	it('reads each declared property exactly once', () => {
		const { proxy, reads } = new ReadingProxy<TokenBudgetOptions>({
			id: 'tokens',
			max: 10,
			scope: 'prompt',
			signal: new AbortController().signal,
		})

		const output = validateTokenBudgetOptions(proxy)

		expect(output.scope).toBe('prompt')
		expect(reads).toEqual(['id', 'max', 'scope', 'signal'])
	})

	it('contains a hostile getter and preserves its cause', () => {
		const input = defineThrowingProperty({}, 'scope')
		const error = captureContractError(() =>
			Reflect.apply(validateTokenBudgetOptions, undefined, [input]),
		)

		expect(error.code).toBe('bound')
		expect(error.context).toEqual({
			path: ['options'],
			limit: 'readable plain record',
			received: 'object',
		})
		expect(error.cause instanceof TypeError).toBe(true)
	})

	it.each([
		['options', [], 'bound', ['options'], 'plain record', preview([])],
		['id', { id: 1, max: 10 }, 'literal', ['options', 'id'], 'string or undefined', '1'],
		['max', { max: Number.NaN }, 'range', ['options', 'max'], 'finite nonnegative number', 'NaN'],
		[
			'scope',
			{ max: 10, scope: 'input' },
			'literal',
			['options', 'scope'],
			"'completion' | 'total' | 'prompt' or undefined",
			'"input"',
		],
		[
			'signal',
			{ max: 10, signal: { aborted: false } },
			'placement',
			['options', 'signal'],
			'native AbortSignal or undefined',
			'object',
		],
	])(
		'rejects invalid %s with exact contract context',
		(_field, input, code, path, limit, received) => {
			const error = captureContractError(() =>
				Reflect.apply(validateTokenBudgetOptions, undefined, [input]),
			)

			expect(error.code).toBe(code)
			expect(error.context).toEqual({ path, limit, received })
		},
	)

	it('preserves the token options type', () => {
		expectTypeOf(validateTokenBudgetOptions).returns.toEqualTypeOf<TokenBudgetOptions>()
	})
})

describe('validateMeterOptions', () => {
	it('returns a fresh copy that keeps the budget and both functions by identity', () => {
		const { budget } = createRecordingBudget<number>(10, selectCharge)
		const input: MeterOptions<number> = {
			budget,
			estimator: selectLength,
			producer: selectCharge,
		}
		const output = validateMeterOptions(input)

		expect(output).not.toBe(input)
		expect(output.budget).toBe(budget)
		expect(output.estimator).toBe(selectLength)
		expect(output.producer).toBe(selectCharge)
		expect(Object.keys(output)).toEqual(['budget', 'estimator', 'producer'])
	})

	it('reads each declared property exactly once', () => {
		const { budget } = createRecordingBudget<number>(10, selectCharge)
		const { proxy, reads } = new ReadingProxy<MeterOptions<number>>({
			budget,
			estimator: selectLength,
			producer: selectCharge,
		})

		const output = validateMeterOptions(proxy)

		expect(output.estimator).toBe(selectLength)
		expect(reads).toEqual(['budget', 'estimator', 'producer'])
	})

	it('contains a hostile getter and preserves its cause', () => {
		const input = defineThrowingProperty(
			{ estimator: selectLength, producer: selectCharge },
			'budget',
		)
		const error = captureContractError(() =>
			Reflect.apply(validateMeterOptions, undefined, [input]),
		)

		expect(error.code).toBe('bound')
		expect(error.context).toEqual({
			path: ['options'],
			limit: 'readable plain record',
			received: 'object',
		})
		expect(error.cause instanceof TypeError).toBe(true)
	})

	it('contains a revoked budget proxy as a placement refusal', () => {
		const { budget } = createRecordingBudget<number>(10, selectCharge)
		const revoked = Proxy.revocable(budget, {})
		revoked.revoke()
		const error = captureContractError(() =>
			Reflect.apply(validateMeterOptions, undefined, [
				{ budget: revoked.proxy, estimator: selectLength, producer: selectCharge },
			]),
		)

		expect(error.code).toBe('placement')
		expect(error.context).toEqual({
			path: ['options', 'budget'],
			limit: 'BudgetInterface',
			received: 'object',
		})
	})

	const { budget: held } = createRecordingBudget<number>(10, selectCharge)

	it.each([
		['options', null, 'bound', ['options'], 'plain record', preview(null)],
		[
			'budget',
			{ budget: {}, estimator: selectLength, producer: selectCharge },
			'placement',
			['options', 'budget'],
			'BudgetInterface',
			'object',
		],
		[
			'estimator',
			{ budget: held, estimator: 1, producer: selectCharge },
			'placement',
			['options', 'estimator'],
			'function',
			'1',
		],
		[
			'producer',
			{ budget: held, estimator: selectLength, producer: 'x' },
			'placement',
			['options', 'producer'],
			'function',
			'"x"',
		],
	])(
		'rejects invalid %s with exact contract context',
		(_field, input, code, path, limit, received) => {
			const error = captureContractError(() =>
				Reflect.apply(validateMeterOptions, undefined, [input]),
			)

			expect(error.code).toBe(code)
			expect(error.context).toEqual({ path, limit, received })
		},
	)

	it('preserves the generic producer type', () => {
		expectTypeOf(validateMeterOptions<number>).returns.toEqualTypeOf<MeterOptions<number>>()
	})
})

describe('validateTokenMeterOptions', () => {
	it('returns a fresh copy that keeps the budget and the estimator by identity', () => {
		const budget = createTokenBudget({ max: 10 })
		const input: TokenMeterOptions = { budget, estimator: selectLength }
		const output = validateTokenMeterOptions(input)

		expect(output).not.toBe(input)
		expect(output.budget).toBe(budget)
		expect(output.estimator).toBe(selectLength)
		expect(Object.keys(output)).toEqual(['budget', 'estimator'])
	})

	it('reads each declared property exactly once', () => {
		const { proxy, reads } = new ReadingProxy<TokenMeterOptions>({
			budget: createTokenBudget({ max: 10 }),
			estimator: selectLength,
		})

		const output = validateTokenMeterOptions(proxy)

		expect(output.estimator).toBe(selectLength)
		expect(reads).toEqual(['budget', 'estimator'])
	})

	it('contains a hostile getter and preserves its cause', () => {
		const input = defineThrowingProperty({ estimator: selectLength }, 'budget')
		const error = captureContractError(() =>
			Reflect.apply(validateTokenMeterOptions, undefined, [input]),
		)

		expect(error.code).toBe('bound')
		expect(error.context).toEqual({
			path: ['options'],
			limit: 'readable plain record',
			received: 'object',
		})
		expect(error.cause instanceof TypeError).toBe(true)
	})

	it.each([
		[
			'options',
			[],
			'bound',
			['options'],
			'plain record',
			preview([]),
			'TokenMeter: options must be a plain record',
		],
		[
			'budget',
			{ budget: null, estimator: selectLength },
			'placement',
			['options', 'budget'],
			'BudgetInterface',
			'null',
			'TokenMeter: budget must implement BudgetInterface',
		],
		[
			'estimator',
			{ budget: createTokenBudget({ max: 1 }), estimator: 2 },
			'placement',
			['options', 'estimator'],
			'function',
			'2',
			'TokenMeter: estimator must be a function',
		],
	])(
		'rejects invalid %s with exact contract context',
		(_field, input, code, path, limit, received, message) => {
			const error = captureContractError(() =>
				Reflect.apply(validateTokenMeterOptions, undefined, [input]),
			)

			expect(error.code).toBe(code)
			expect(error.message).toBe(message)
			expect(error.context).toEqual({ path, limit, received })
		},
	)

	it('preserves the token meter options type', () => {
		expectTypeOf(validateTokenMeterOptions).returns.toEqualTypeOf<TokenMeterOptions>()
	})
})
