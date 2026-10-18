import type { BudgetInterface, TokenScope, TokenUsage } from '@src/core'
import {
	Budget,
	createBudget,
	createTokenBudget,
	isBudget,
	isBudgetAmount,
	isBudgetSignal,
	isTokenScope,
	isTokenUsage,
} from '@src/core'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { createBudgetCandidate, defineThrowingProperty, selectCharge } from '../../setup.js'

describe('isBudgetAmount', () => {
	it.each([0, -0, 0.25, 1, Number.MAX_VALUE])('accepts finite nonnegative %s', (value) => {
		expect(isBudgetAmount(value)).toBe(true)
	})

	it.each([
		undefined,
		null,
		'',
		-1,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
	])('rejects %s', (value) => {
		expect(isBudgetAmount(value)).toBe(false)
	})

	it('narrows unknown values to numbers', () => {
		expectTypeOf(isBudgetAmount).guards.toEqualTypeOf<number>()
	})
})

describe('isBudgetSignal', () => {
	it('accepts native signals before and after abort', () => {
		const controller = new AbortController()

		expect(isBudgetSignal(controller.signal)).toBe(true)
		controller.abort()
		expect(isBudgetSignal(controller.signal)).toBe(true)
	})

	it.each([
		['undefined', undefined],
		['null', null],
		['false', false],
		['zero', 0],
		['an empty string', ''],
		['an object', {}],
		['a structural spoof', { aborted: false }],
		['the native prototype', AbortSignal.prototype],
	])('rejects %s', (_label, value) => {
		expect(isBudgetSignal(value)).toBe(false)
	})

	it('contains revoked proxies', () => {
		const revoked = Proxy.revocable(new AbortController().signal, {})
		revoked.revoke()

		expect(isBudgetSignal(revoked.proxy)).toBe(false)
	})

	it('narrows unknown values to native signals', () => {
		expectTypeOf(isBudgetSignal).guards.toEqualTypeOf<AbortSignal>()
	})
})

describe('isBudget', () => {
	it('accepts a real budget, a token budget, and a started or exhausted budget', () => {
		const exhausted = createBudget<number>({ max: 1, consumer: selectCharge })
		exhausted.consume(1)
		exhausted.start()

		expect(isBudget(new Budget<number>({ max: 10, consumer: selectCharge }))).toBe(true)
		expect(isBudget(createTokenBudget({ max: 10 }))).toBe(true)
		expect(isBudget(exhausted)).toBe(true)
	})

	it('accepts a plain object that implements every member', () => {
		expect(isBudget(createBudgetCandidate())).toBe(true)
		expect(isBudget(createBudgetCandidate({ max: 0, consumed: 0, remaining: 0 }))).toBe(true)
	})

	it.each([
		['a missing id', { id: undefined }],
		['a numeric id', { id: 3 }],
		['a missing signal', { signal: undefined }],
		['a structural signal spoof', { signal: { aborted: false } }],
		['a negative max', { max: -1 }],
		['a nonfinite max', { max: Number.POSITIVE_INFINITY }],
		['a string max', { max: '10' }],
		['a NaN consumed', { consumed: Number.NaN }],
		['a negative remaining', { remaining: -1 }],
		['a numeric exhausted', { exhausted: 0 }],
		['a missing start', { start: undefined }],
		['a non-callable start', { start: 'start' }],
		['a missing consume', { consume: undefined }],
		['a non-callable consume', { consume: {} }],
		['a missing clear', { clear: undefined }],
		['a non-callable clear', { clear: true }],
	])('rejects %s', (_label, overrides) => {
		expect(isBudget(createBudgetCandidate(overrides))).toBe(false)
	})

	it.each([
		['undefined', undefined],
		['null', null],
		['a number', 7],
		['a string', 'budget'],
		['an empty object', {}],
		['a function', selectCharge],
		['an array', []],
		['an object holding only consume', { consume: selectCharge }],
		['a bare AbortSignal', new AbortController().signal],
	])('rejects %s', (_label, value) => {
		expect(isBudget(value)).toBe(false)
	})

	it.each([
		'id',
		'signal',
		'max',
		'consumed',
		'remaining',
		'exhausted',
		'start',
		'consume',
		'clear',
	])('contains a hostile %s getter', (key) => {
		expect(isBudget(defineThrowingProperty(createBudgetCandidate(), key))).toBe(false)
	})

	it('contains revoked proxies', () => {
		const budgetRevoked = Proxy.revocable(
			createBudget<number>({ max: 1, consumer: selectCharge }),
			{},
		)
		const candidateRevoked = Proxy.revocable(createBudgetCandidate(), {})
		budgetRevoked.revoke()
		candidateRevoked.revoke()

		expect(isBudget(budgetRevoked.proxy)).toBe(false)
		expect(isBudget(candidateRevoked.proxy)).toBe(false)
	})

	it('contains a proxy whose trap throws', () => {
		const hostile = new Proxy(createBudgetCandidate(), {
			get() {
				throw new Error('hostile trap')
			},
		})

		expect(isBudget(hostile)).toBe(false)
	})

	it('narrows unknown values to the budget contract', () => {
		expectTypeOf(isBudget).guards.toEqualTypeOf<BudgetInterface<unknown>>()
	})
})

describe('isTokenScope', () => {
	it.each(['completion', 'total', 'prompt'])('accepts %s', (value) => {
		expect(isTokenScope(value)).toBe(true)
	})

	it.each([undefined, null, '', 'input', 'Completion', 0])('rejects %s', (value) => {
		expect(isTokenScope(value)).toBe(false)
	})

	it('narrows unknown values to TokenScope', () => {
		expectTypeOf(isTokenScope).guards.toEqualTypeOf<TokenScope>()
	})
})

describe('isTokenUsage', () => {
	it('accepts finite nonnegative token counts and extra inert data', () => {
		expect(isTokenUsage({ prompt: 0, completion: 1.5, total: 1.5 })).toBe(true)
		expect(isTokenUsage({ prompt: 1, completion: 2, total: 3, provider: 'example' })).toBe(true)
	})

	it.each([
		undefined,
		null,
		[],
		{},
		{ prompt: 1 },
		{ prompt: -1, completion: 1, total: 0 },
		{ prompt: 1, completion: Number.NaN, total: 1 },
		{ prompt: 1, completion: 1, total: Number.POSITIVE_INFINITY },
		{ prompt: '1', completion: 1, total: 2 },
	])('rejects %s', (value) => {
		expect(isTokenUsage(value)).toBe(false)
	})

	it('contains hostile getters', () => {
		const value = defineThrowingProperty({ completion: 1, total: 1 }, 'prompt')

		expect(isTokenUsage(value)).toBe(false)
	})

	it('contains revoked proxies', () => {
		const revoked = Proxy.revocable({ prompt: 1, completion: 2, total: 3 }, {})
		revoked.revoke()

		expect(isTokenUsage(revoked.proxy)).toBe(false)
	})

	it('narrows unknown values to TokenUsage', () => {
		expectTypeOf(isTokenUsage).guards.toEqualTypeOf<TokenUsage>()
	})
})
