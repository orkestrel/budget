import type {
	BudgetInterface,
	BudgetOptions,
	TokenBudgetOptions,
	TokenScope,
	TokenUsage,
} from '@src/core'
import { createBudget, createTokenBudget, createTokenConsumer } from '@src/core'
import { preview } from '@orkestrel/contract'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { createRecorder } from '@orkestrel/test'
import { captureContractError, selectCharge } from '../../setup.js'

function usage(prompt: number, completion: number, total: number): TokenUsage {
	return { prompt, completion, total }
}

describe('createBudget', () => {
	it('returns a working BudgetInterface', () => {
		const budget = createBudget<number>({ max: 100, consume: selectCharge })
		const fired = createRecorder<readonly []>()
		budget.signal.addEventListener('abort', fired.handler)

		budget.consume(60)
		budget.consume(40)

		expect(budget.max).toBe(100)
		expect(budget.consumed).toBe(100)
		expect(budget.remaining).toBe(0)
		expect(budget.exhausted).toBe(true)
		expect(budget.signal.aborted).toBe(true)
		expect(fired.count).toBe(1)
	})

	it('passes identity and parent options through the validated constructor', () => {
		const parent = new AbortController()
		const budget = createBudget<number>({
			id: 'budget-7',
			max: 100,
			consume: selectCharge,
			signal: parent.signal,
		})

		expect(budget.id).toBe('budget-7')
		parent.abort('parent')
		expect(budget.signal.aborted).toBe(true)
		expect(budget.signal.reason).toBe('parent')
		expect(budget.exhausted).toBe(false)
	})

	it('rejects an untyped non-function consumer through the factory boundary', () => {
		const options = { max: 10, consume: 1 }
		const error = captureContractError(() => Reflect.apply(createBudget, undefined, [options]))

		expect(error.code).toBe('placement')
		expect(error.context).toEqual({
			path: ['options', 'consume'],
			limit: 'function',
			received: '1',
		})
	})
})

describe('createTokenConsumer', () => {
	it('selects each supported token usage field', () => {
		const value = usage(100, 15, 115)

		expect(createTokenConsumer('completion')(value)).toBe(15)
		expect(createTokenConsumer('total')(value)).toBe(115)
		expect(createTokenConsumer('prompt')(value)).toBe(100)
	})

	it('rejects an unsupported untyped scope with exact literal context', () => {
		const error = captureContractError(() =>
			Reflect.apply(createTokenConsumer, undefined, ['input']),
		)

		expect(error.code).toBe('literal')
		expect(error.context).toEqual({
			path: ['scope'],
			limit: "'completion' | 'total' | 'prompt'",
			received: '"input"',
		})
	})

	it.each([
		['null', null],
		['an array', []],
		['missing fields', { prompt: 1 }],
		['a negative count', { prompt: -1, completion: 1, total: 0 }],
		['NaN', { prompt: 1, completion: Number.NaN, total: 1 }],
		['infinity', { prompt: 1, completion: 1, total: Number.POSITIVE_INFINITY }],
	])('rejects %s usage with exact placement context', (_label, value) => {
		const consumer = createTokenConsumer('completion')
		const error = captureContractError(() => Reflect.apply(consumer, undefined, [value]))

		expect(error.code).toBe('placement')
		expect(error.context).toEqual({
			path: ['usage'],
			limit: 'finite nonnegative prompt, completion, and total',
			received: preview(value),
		})
	})

	it('contains a hostile token getter as invalid usage', () => {
		const descriptor = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')
		if (descriptor === undefined) throw new Error('Expected the native aborted descriptor')
		const value = { completion: 1, total: 1 }
		Object.defineProperty(value, 'prompt', descriptor)
		const consumer = createTokenConsumer('prompt')
		const error = captureContractError(() => Reflect.apply(consumer, undefined, [value]))

		expect(error.code).toBe('placement')
		expect(error.context).toEqual({
			path: ['usage'],
			limit: 'finite nonnegative prompt, completion, and total',
			received: 'object',
		})
	})

	it('contains revoked usage proxies', () => {
		const revoked = Proxy.revocable(usage(1, 2, 3), {})
		revoked.revoke()
		const consumer = createTokenConsumer('total')
		const error = captureContractError(() => Reflect.apply(consumer, undefined, [revoked.proxy]))

		expect(error.code).toBe('placement')
		expect(error.context).toEqual({
			path: ['usage'],
			limit: 'finite nonnegative prompt, completion, and total',
			received: 'object',
		})
	})
})

describe('createTokenBudget construction boundary', () => {
	it.each([
		['undefined', undefined],
		['null', null],
		['an array', []],
	])('rejects %s options with exact bound context', (_label, value) => {
		const error = captureContractError(() => Reflect.apply(createTokenBudget, undefined, [value]))

		expect(error.code).toBe('bound')
		expect(error.context).toEqual({
			path: ['options'],
			limit: 'plain record',
			received: preview(value),
		})
	})

	it('contains unreadable options and preserves the cause', () => {
		const descriptor = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')
		if (descriptor === undefined) throw new Error('Expected the native aborted descriptor')
		const options = {}
		Object.defineProperty(options, 'max', descriptor)
		const error = captureContractError(() => Reflect.apply(createTokenBudget, undefined, [options]))

		expect(error.code).toBe('bound')
		expect(error.context).toEqual({
			path: ['options'],
			limit: 'readable plain record',
			received: 'object',
		})
		expect(error.cause instanceof TypeError).toBe(true)
	})

	it.each([
		['id', { id: 1, max: 10 }, 'literal', ['options', 'id'], 'string or undefined', '1'],
		['max', { max: -1 }, 'range', ['options', 'max'], 'finite nonnegative number', '-1'],
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
		(_field, options, code, path, limit, received) => {
			const error = captureContractError(() =>
				Reflect.apply(createTokenBudget, undefined, [options]),
			)

			expect(error.code).toBe(code)
			expect(error.context).toEqual({ path, limit, received })
		},
	)

	it('contains a revoked parent signal proxy', () => {
		const revoked = Proxy.revocable(new AbortController().signal, {})
		revoked.revoke()
		const error = captureContractError(() =>
			Reflect.apply(createTokenBudget, undefined, [{ max: 10, signal: revoked.proxy }]),
		)

		expect(error.code).toBe('placement')
		expect(error.context).toEqual({
			path: ['options', 'signal'],
			limit: 'native AbortSignal or undefined',
			received: 'object',
		})
	})
})

describe('createTokenBudget', () => {
	it('charges completion by default and permits a valid overshoot', () => {
		const budget = createTokenBudget({ max: 20 })

		budget.consume(usage(100, 15, 115))
		budget.consume(usage(50, 10, 60))

		expect(budget.consumed).toBe(25)
		expect(budget.remaining).toBe(0)
		expect(budget.exhausted).toBe(true)
		expect(budget.signal.aborted).toBe(true)
	})

	it.each([
		['total', 115],
		['prompt', 100],
	] satisfies ReadonlyArray<readonly [TokenScope, number]>)(
		'charges the %s field',
		(scope, expected) => {
			const budget = createTokenBudget({ max: 1_000, scope })

			budget.consume(usage(100, 15, 115))

			expect(budget.consumed).toBe(expected)
		},
	)

	it('honors identity, parent reason, start, and clear', () => {
		const parent = new AbortController()
		const budget = createTokenBudget({
			id: 'tokens-3',
			max: 100,
			scope: 'total',
			signal: parent.signal,
		})

		budget.consume(usage(20, 20, 40))
		const initial = budget.signal
		budget.start()
		expect(budget.id).toBe('tokens-3')
		expect(budget.consumed).toBe(40)
		expect(budget.signal).not.toBe(initial)

		budget.clear()
		expect(budget.consumed).toBe(0)
		parent.abort('parent')
		expect(budget.signal.reason).toBe('parent')
	})

	it('assigns an id only when it is omitted', () => {
		const generated = createTokenBudget({ max: 1_000 })
		const empty = createTokenBudget({ id: '', max: 1_000 })

		expect(generated.id.length > 0).toBe(true)
		expect(empty.id).toBe('')
	})
})

describe('factory types', () => {
	it('preserves generic budget and token contracts', () => {
		expectTypeOf<BudgetOptions<number>['consume']>().toEqualTypeOf<(value: number) => number>()
		expectTypeOf(createBudget<number>({ max: 1, consume: selectCharge })).toEqualTypeOf<
			BudgetInterface<number>
		>()
		expectTypeOf<TokenScope>().toEqualTypeOf<'completion' | 'total' | 'prompt'>()
		expectTypeOf<TokenUsage>().toEqualTypeOf<{
			readonly prompt: number
			readonly completion: number
			readonly total: number
		}>()
		expectTypeOf(createTokenBudget).parameter(0).toEqualTypeOf<TokenBudgetOptions>()
		expectTypeOf(createTokenBudget({ max: 1 })).toEqualTypeOf<BudgetInterface<TokenUsage>>()
	})
})
