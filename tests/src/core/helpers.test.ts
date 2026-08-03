import type { BudgetOptions, TokenBudgetOptions } from '@src/core'
import { validateBudgetOptions, validateTokenBudgetOptions } from '@src/core'
import { preview } from '@orkestrel/contract'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { captureContractError, selectCharge } from '../../setup.js'

let budgetReads: PropertyKey[] = []
let tokenReads: PropertyKey[] = []

const budgetHandler: ProxyHandler<BudgetOptions<number>> = {
	get(target, property, receiver) {
		budgetReads.push(property)
		return Reflect.get(target, property, receiver)
	},
}

const tokenHandler: ProxyHandler<TokenBudgetOptions> = {
	get(target, property, receiver) {
		tokenReads.push(property)
		return Reflect.get(target, property, receiver)
	},
}

describe('validateBudgetOptions', () => {
	it('returns a fresh copy and omits absent optional keys', () => {
		const input: BudgetOptions<number> = { max: 10, consume: selectCharge }
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
			consume: selectCharge,
			signal,
		}
		const output = validateBudgetOptions(input)

		expect(output).not.toBe(input)
		expect(output).toEqual(input)
		expect(Object.hasOwn(output, 'id')).toBe(true)
		expect(Object.hasOwn(output, 'signal')).toBe(true)
	})

	it('reads each declared property exactly once', () => {
		budgetReads = []
		const input = new Proxy<BudgetOptions<number>>(
			{ id: 'meter', max: 10, consume: selectCharge, signal: new AbortController().signal },
			budgetHandler,
		)

		const output = validateBudgetOptions(input)

		expect(output.id).toBe('meter')
		expect(budgetReads).toEqual(['id', 'max', 'consume', 'signal'])
	})

	it('contains a hostile getter and preserves its cause', () => {
		const descriptor = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')
		if (descriptor === undefined) throw new Error('Expected the native aborted descriptor')
		const input = { consume: selectCharge }
		Object.defineProperty(input, 'max', descriptor)
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
			{ id: 1, max: 10, consume: selectCharge },
			'literal',
			['options', 'id'],
			'string or undefined',
			'1',
		],
		[
			'max',
			{ max: Number.POSITIVE_INFINITY, consume: selectCharge },
			'range',
			['options', 'max'],
			'finite nonnegative number',
			'Infinity',
		],
		['consume', { max: 10, consume: 1 }, 'placement', ['options', 'consume'], 'function', '1'],
		[
			'signal',
			{ max: 10, consume: selectCharge, signal: { aborted: false } },
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
		tokenReads = []
		const input = new Proxy<TokenBudgetOptions>(
			{ id: 'tokens', max: 10, scope: 'prompt', signal: new AbortController().signal },
			tokenHandler,
		)

		const output = validateTokenBudgetOptions(input)

		expect(output.scope).toBe('prompt')
		expect(tokenReads).toEqual(['id', 'max', 'scope', 'signal'])
	})

	it('contains a hostile getter and preserves its cause', () => {
		const descriptor = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')
		if (descriptor === undefined) throw new Error('Expected the native aborted descriptor')
		const input = {}
		Object.defineProperty(input, 'scope', descriptor)
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
