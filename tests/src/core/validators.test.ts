import type { TokenScope, TokenUsage } from '@src/core'
import { isBudgetAmount, isBudgetSignal, isTokenScope, isTokenUsage } from '@src/core'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { defineThrowingProperty } from '../../setup.js'

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
