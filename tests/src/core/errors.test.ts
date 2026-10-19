import { isConstructor, isFunction, isRecord } from '@orkestrel/contract'
import { BUDGET_ERROR_BRAND, BudgetError, isBudgetError } from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	BUDGET_ERROR_CONTEXT_SHAPES,
	buildBudgetErrorForgery,
	buildBudgetErrorHostileValues,
} from '../../setup.js'

describe('budget error brand', () => {
	it('recognizes a BudgetError built by the same copy', () => {
		expect(isBudgetError(new BudgetError({ id: 'tokens', max: 10, consumed: 12 }))).toBe(true)
	})

	it('stamps its own identity under the registry-global key, not enumerable', () => {
		const error = new BudgetError({ id: 'tokens', max: 10, consumed: 12 })

		expect(BUDGET_ERROR_BRAND).toBe(Symbol.for('@orkestrel/budget.error'))
		expect(Object.getOwnPropertyDescriptor(error, BUDGET_ERROR_BRAND)).toStrictEqual({
			value: error,
			writable: false,
			enumerable: false,
			configurable: true,
		})
		expect(Object.getOwnPropertySymbols(error)).toStrictEqual([BUDGET_ERROR_BRAND])
		// A spread copies enumerable own symbols, so an enumerable stamp would survive it.
		expect(Object.getOwnPropertySymbols({ ...error })).toStrictEqual([])
	})

	it('recognizes errors across two source copies in both directions', () => {
		const firstModules = import.meta.glob('../../../src/core/errors.ts', {
			eager: true,
			query: '?copy=first',
		})
		const secondModules = import.meta.glob('../../../src/core/errors.ts', {
			eager: true,
			query: '?copy=second',
		})
		const first: unknown = Object.values(firstModules)[0]
		const second: unknown = Object.values(secondModules)[0]
		if (!isRecord(first) || !isRecord(second)) throw new Error('source error copies did not load')
		const firstGuard = first.isBudgetError
		const secondGuard = second.isBudgetError
		const FirstConstructor = first.BudgetError
		const SecondConstructor = second.BudgetError
		if (
			!isFunction(firstGuard) ||
			!isFunction(secondGuard) ||
			!isConstructor(FirstConstructor) ||
			!isConstructor(SecondConstructor)
		) {
			throw new Error('source error exports did not load')
		}
		const fromFirst: unknown = Reflect.construct(FirstConstructor, [
			{ id: 'first', max: 1, consumed: 2 },
		])
		const fromSecond: unknown = Reflect.construct(SecondConstructor, [
			{ id: 'second', max: 1, consumed: 2 },
		])
		const lookalike = Object.assign(new Error('budget reached its ceiling'), {
			code: 'exhaust',
			context: { id: 'lookalike', max: 1, consumed: 2 },
		})

		// The control: a cross-copy answer proves nothing unless the copies are distinct classes.
		expect(FirstConstructor).not.toBe(SecondConstructor)
		expect(fromSecond instanceof FirstConstructor).toBe(false)
		expect(firstGuard(fromFirst)).toBe(true)
		expect(secondGuard(fromSecond)).toBe(true)
		expect(firstGuard(fromSecond)).toBe(true)
		expect(secondGuard(fromFirst)).toBe(true)
		expect(firstGuard(lookalike)).toBe(false)
		expect(secondGuard(lookalike)).toBe(false)
	})

	it('refuses a stamped forgery whose brand stores another object', () => {
		const other = new BudgetError({ id: 'other', max: 1, consumed: 1 })

		expect(isBudgetError(buildBudgetErrorForgery(true, () => other))).toBe(false)
	})

	it('refuses a transparent proxy over a genuine BudgetError', () => {
		const error = new BudgetError({ id: 'tokens', max: 10, consumed: 12 })

		expect(isBudgetError(error)).toBe(true)
		expect(isBudgetError(new Proxy(error, {}))).toBe(false)
	})

	it('admits a complete forgery carrying its own identity brand', () => {
		expect(isBudgetError(buildBudgetErrorForgery(true, (forgery) => forgery))).toBe(true)
	})

	it('refuses a branded error whose name is not BudgetError', () => {
		const renamed = new BudgetError({ id: 'tokens', max: 10, consumed: 12 })
		const forgery = buildBudgetErrorForgery(true, (candidate) => candidate)

		expect(Reflect.set(renamed, 'name', 'RangeError')).toBe(true)
		expect(isBudgetError(renamed)).toBe(false)
		expect(isBudgetError(forgery)).toBe(true)
		expect(Reflect.set(forgery, 'name', 'Error')).toBe(true)
		expect(isBudgetError(forgery)).toBe(false)
	})

	it('refuses a branded error whose code is not exhaust', () => {
		const error = new BudgetError({ id: 'tokens', max: 10, consumed: 12 })

		expect(Reflect.set(error, 'code', 'abort')).toBe(true)
		expect(isBudgetError(error)).toBe(false)
	})

	it('refuses a branded error whose context is not BudgetErrorContext', () => {
		for (const context of BUDGET_ERROR_CONTEXT_SHAPES) {
			const error = new BudgetError({ id: 'tokens', max: 10, consumed: 12 })
			Reflect.set(error, 'context', context)
			expect(isBudgetError(error)).toBe(false)
		}
		const reading = Object.assign(Object.create({ kind: 'reading' }), {
			id: 'tokens',
			max: 10,
			consumed: 12,
		})
		const classed = new BudgetError({ id: 'tokens', max: 10, consumed: 12 })
		Reflect.set(classed, 'context', reading)
		expect(isBudgetError(classed)).toBe(true)
	})

	it('refuses a plain Error carrying its own identity brand', () => {
		expect(isBudgetError(buildBudgetErrorForgery(false, (forgery) => forgery))).toBe(false)
	})

	it('refuses an unbranded Error carrying code exhaust', () => {
		const lookalike = Object.assign(new Error('budget reached its ceiling'), {
			code: 'exhaust',
			context: { id: 'x', max: 1, consumed: 2 },
		})
		const truthy = Object.defineProperty(
			new Error('budget reached its ceiling'),
			BUDGET_ERROR_BRAND,
			{
				value: true,
			},
		)

		expect(isBudgetError(lookalike)).toBe(false)
		expect(isBudgetError(truthy)).toBe(false)
		expect(isBudgetError(buildBudgetErrorForgery(true, () => true))).toBe(false)
		expect(isBudgetError(buildBudgetErrorForgery(true))).toBe(false)
	})

	it('refuses a DOMException AbortError', () => {
		expect(isBudgetError(new DOMException('aborted', 'AbortError'))).toBe(false)
	})

	it('returns false without throwing for null, primitives, hostile getters, and a revoked proxy', () => {
		for (const value of buildBudgetErrorHostileValues()) {
			expect(() => isBudgetError(value)).not.toThrow()
			expect(isBudgetError(value)).toBe(false)
		}
	})

	it('refuses a genuine BudgetError whose brand was removed', () => {
		const error = new BudgetError({ id: 'tokens', max: 10, consumed: 12 })

		expect(isBudgetError(error)).toBe(true)
		expect(Reflect.deleteProperty(error, BUDGET_ERROR_BRAND)).toBe(true)
		expect(error instanceof BudgetError).toBe(true)
		expect(isBudgetError(error)).toBe(false)
	})
})
