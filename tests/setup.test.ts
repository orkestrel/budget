// The proof for `tests/setup.ts`, the workspace's host-independent test setup module.
// Its subject is the exported test-infrastructure behavior the consuming suites rely on,
// one case per behavioral contract. Production behavior — what `Budget` refuses and what
// it charges — is proven by the suites under `tests/src/core/`, never re-proven here.

import { describe, expect, it } from 'vitest'
import { ContractError, isObject } from '@orkestrel/contract'
import { BUDGET_ERROR_BRAND, BudgetError, isBudget } from '@src/core'
import {
	CallCounter,
	ReadingProxy,
	BUDGET_ERROR_CONTEXT_SHAPES,
	buildBudgetErrorForgery,
	buildBudgetErrorHostileValues,
	captureContractError,
	createBudgetCandidate,
	createRecordingBudget,
	createTokenUsage,
	defineThrowingProperty,
	requireBudgetError,
	selectCharge,
	selectLength,
	selectQuarterLength,
} from './setup.js'

describe('captureContractError', () => {
	it('returns the thrown contract error itself, narrowed', () => {
		// The expected error is built here through the contract package's own constructor,
		// so the assertion compares the helper's return against a value the helper had no
		// part in producing.
		const thrown = new ContractError('Budget maximum exceeds its ceiling', {
			code: 'range',
			context: { path: ['max'], limit: 10, received: '11' },
		})
		const captured = captureContractError(() => {
			throw thrown
		})
		expect(captured).toBe(thrown)
		// Reading `code` and `context` without a guard is the narrowing the consuming
		// suites depend on. `npm run check` reddens here when the return type widens.
		expect(captured.code).toBe('range')
		expect(captured.context?.limit).toBe(10)
	})

	it('refuses a thrown value that is not a contract error', () => {
		expect(() =>
			captureContractError(() => {
				throw new TypeError('a host failure, not a refusal')
			}),
		).toThrow('Expected a ContractError')
		// A thrown non-`Error` value takes the same path: class membership decides, not
		// whether the value is throwable.
		expect(() =>
			captureContractError(() => {
				throw 'range'
			}),
		).toThrow('Expected a ContractError')
	})

	it('refuses an operation that completes without throwing', () => {
		// The underlying capture returns `undefined` for a thunk that completes, so a suite
		// asserting a refusal must fail here rather than receive an absent error.
		expect(() => captureContractError(() => 'no refusal')).toThrow('Expected a ContractError')
	})
})

describe('selectCharge', () => {
	it('returns every charge unchanged, including negative zero and NaN', () => {
		// A suite passes this as the `consumer` option so a `consume(n)` call charges exactly
		// `n`. The boundary values are the ones a charge selector can silently normalize:
		// `toBe` compares with `Object.is`, so a `-0` widened to `0` and a lost `NaN` both
		// redden.
		const charges: readonly number[] = [
			0,
			-0,
			1,
			2.5,
			-3,
			Number.EPSILON,
			Number.MAX_VALUE,
			Number.MIN_SAFE_INTEGER,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
			Number.NaN,
		]
		for (const charge of charges) expect(selectCharge(charge)).toBe(charge)
	})
})

describe('createTokenUsage', () => {
	it('returns exactly the three named counts', () => {
		// The positional order is the one every call site depends on: a swapped `prompt`
		// and `completion` would still type-check, so the record is compared field by field.
		expect(createTokenUsage(100, 15, 115)).toStrictEqual({
			prompt: 100,
			completion: 15,
			total: 115,
		})
	})
})

describe('ReadingProxy', () => {
	it('records every property read in read order and returns the target values', () => {
		const { proxy, reads } = new ReadingProxy({ max: 10, scope: 'total' })

		expect(reads).toEqual([])
		expect(proxy.scope).toBe('total')
		expect(proxy.max).toBe(10)
		// The log is the same live array the proxy appends to, so a read that happens after
		// the entity was destructured is still visible here.
		expect(reads).toEqual(['scope', 'max'])
	})
})

describe('CallCounter', () => {
	it('numbers each call from one and counts them', () => {
		const calls = new CallCounter()

		expect(calls.count).toBe(0)
		expect(calls.next()).toBe(1)
		expect(calls.next()).toBe(2)
		expect(calls.next()).toBe(3)
		expect(calls.count).toBe(3)
	})

	it('keeps an independent count for every counter', () => {
		const first = new CallCounter()
		const second = new CallCounter()

		first.next()
		first.next()

		expect(first.count).toBe(2)
		expect(second.count).toBe(0)
		expect(second.next()).toBe(1)
	})
})

describe('defineThrowingProperty', () => {
	it('installs a key that throws a TypeError on read and leaves a sibling readable', () => {
		const input = { completion: 1 }
		const target = defineThrowingProperty(input, 'prompt')

		expect(target).toBe(input)
		expect(() => Reflect.get(target, 'prompt')).toThrow(TypeError)
		expect(target.completion).toBe(1)
	})
})

describe('selectLength', () => {
	it('returns the text length, counting the empty text as zero', () => {
		expect(selectLength('')).toBe(0)
		expect(selectLength('hello')).toBe(5)
	})
})

describe('selectQuarterLength', () => {
	it('rounds a quarter of the length up at and between the step boundaries', () => {
		// Each expectation is a literal read off the 4-character step: the helper is not
		// compared with its own formula.
		expect(selectQuarterLength('')).toBe(0)
		expect(selectQuarterLength('abcd')).toBe(1)
		expect(selectQuarterLength('abcde')).toBe(2)
		expect(selectQuarterLength('Once upon')).toBe(3)
	})
})

describe('createRecordingBudget', () => {
	it('records each consumed value in order and charges the selected amount', () => {
		const { budget, charges } = createRecordingBudget<{ readonly weight: number }>(
			10,
			(value) => value.weight,
		)

		budget.consume({ weight: 3 })
		budget.consume({ weight: 4 })

		expect(charges.calls).toEqual([[{ weight: 3 }], [{ weight: 4 }]])
		expect(budget.consumed).toBe(7)
		expect(budget.max).toBe(10)
	})

	it('records a value whose selection throws and leaves the tally unchanged', () => {
		const failure = new Error('refused')
		const { budget, charges } = createRecordingBudget<number>(10, () => {
			throw failure
		})

		expect(() => budget.consume(5)).toThrow(failure)
		expect(charges.calls).toEqual([[5]])
		expect(budget.consumed).toBe(0)
	})
})

describe('requireBudgetError', () => {
	it('returns a BudgetError itself, narrowed', () => {
		const reason = new BudgetError({ id: 'tokens', max: 10, consumed: 12 })
		const required = requireBudgetError(reason)

		expect(required).toBe(reason)
		// Reading `context` without a guard is the narrowing the consuming suites depend on.
		expect(required.context.consumed).toBe(12)
	})

	it('refuses a reason that is not a BudgetError', () => {
		expect(() => requireBudgetError(new DOMException('aborted', 'AbortError'))).toThrow(
			'Expected a BudgetError',
		)
		expect(() => requireBudgetError(undefined)).toThrow('Expected a BudgetError')
	})
})

describe('buildBudgetErrorForgery', () => {
	it('sets the name, the code, and the context a BudgetError carries', () => {
		const forgery = buildBudgetErrorForgery(true)

		expect(forgery.message).toBe('budget reached its ceiling')
		expect(forgery.name).toBe('BudgetError')
		expect(Reflect.get(forgery, 'code')).toBe('exhaust')
		expect(Reflect.get(forgery, 'context')).toStrictEqual({ id: 'forged', max: 1, consumed: 1 })
	})

	it('takes an Error subclass prototype for true and the Error prototype for false', () => {
		const subclassed = buildBudgetErrorForgery(true)
		const plain = buildBudgetErrorForgery(false)

		expect(subclassed instanceof Error).toBe(true)
		expect(Object.getPrototypeOf(subclassed)).not.toBe(Error.prototype)
		expect(Object.getPrototypeOf(Object.getPrototypeOf(subclassed))).toBe(Error.prototype)
		expect(Object.getPrototypeOf(plain)).toBe(Error.prototype)
	})

	it('stamps nothing without a brand and stores what the brand callback returns', () => {
		const other = new BudgetError({ id: 'other', max: 1, consumed: 1 })
		const unbranded = buildBudgetErrorForgery(true)
		const foreign = buildBudgetErrorForgery(true, () => other)
		const own = buildBudgetErrorForgery(true, (forgery) => forgery)

		expect(Object.getOwnPropertyDescriptor(unbranded, BUDGET_ERROR_BRAND)).toBeUndefined()
		expect(Object.getOwnPropertyDescriptor(foreign, BUDGET_ERROR_BRAND)?.value).toBe(other)
		expect(Object.getOwnPropertyDescriptor(own, BUDGET_ERROR_BRAND)?.value).toBe(own)
	})
})

describe('BUDGET_ERROR_CONTEXT_SHAPES', () => {
	it('preserves every off-shape context and freezes shared records', () => {
		expect(BUDGET_ERROR_CONTEXT_SHAPES).toStrictEqual([
			undefined,
			null,
			'tokens',
			{ id: 7, max: 1, consumed: 1 },
			{ id: 'tokens', max: '1', consumed: 1 },
			{ id: 'tokens', max: 1 },
		])
		expect(Object.isFrozen(BUDGET_ERROR_CONTEXT_SHAPES)).toBe(true)
		for (const context of BUDGET_ERROR_CONTEXT_SHAPES.filter(isObject)) {
			expect(Object.isFrozen(context)).toBe(true)
		}
	})
})

describe('buildBudgetErrorHostileValues', () => {
	it('preserves primitive controls and supplies a revoked proxy and self-branded throwing accessors', () => {
		const values = buildBudgetErrorHostileValues()
		const [absent, missing, text, zero, symbol, revoked, context, name] = values

		expect(values).toHaveLength(8)
		expect(Object.isFrozen(values)).toBe(true)
		expect(absent).toBeNull()
		expect(missing).toBeUndefined()
		expect(text).toBe('BudgetError')
		expect(zero).toBe(0)
		expect(typeof symbol).toBe('symbol')
		expect(String(symbol)).toBe('Symbol(budget)')
		if (!isObject(revoked)) throw new Error('Expected a revoked proxy')
		expect(() => Reflect.getPrototypeOf(revoked)).toThrow(TypeError)
		if (!(context instanceof Error) || !(name instanceof Error)) {
			throw new Error('Expected hostile Error instances')
		}
		expect(Object.getOwnPropertyDescriptor(context, BUDGET_ERROR_BRAND)?.value).toBe(context)
		expect(Object.getOwnPropertyDescriptor(name, BUDGET_ERROR_BRAND)?.value).toBe(name)
		expect(context.name).toBe('BudgetError')
		expect(Reflect.get(name, 'context')).toStrictEqual({ id: 'forged', max: 1, consumed: 1 })
		expect(() => Reflect.get(context, 'context')).toThrow('hostile context')
		expect(() => Reflect.get(name, 'name')).toThrow('hostile name')
	})

	it('allocates fresh revoked proxies, errors, and throwing accessors for each call', () => {
		const first = buildBudgetErrorHostileValues()
		const second = buildBudgetErrorHostileValues()

		expect(Object.is(first, second)).toBe(false)
		for (const [index, value] of first.entries()) {
			if (index < 4) continue
			expect(Object.is(value, second[index])).toBe(false)
			if (index < 6 || !isObject(value)) continue
			const other = second[index]
			if (!isObject(other)) throw new Error('Expected a fresh hostile error')
			const property = index === 6 ? 'context' : 'name'
			expect(Object.getOwnPropertyDescriptor(value, property)?.get).not.toBe(
				Object.getOwnPropertyDescriptor(other, property)?.get,
			)
			expect(() => Reflect.get(other, property)).toThrow(`hostile ${property}`)
		}
	})
})

describe('createBudgetCandidate', () => {
	it('builds a candidate the guard accepts and applies each override', () => {
		expect(isBudget(createBudgetCandidate())).toBe(true)
		expect(createBudgetCandidate({ max: -1 }).max).toBe(-1)
		expect(createBudgetCandidate({ id: undefined }).id).toBeUndefined()
		expect(isBudget(createBudgetCandidate({ max: -1 }))).toBe(false)
	})

	it('returns a fresh signal for every candidate', () => {
		expect(createBudgetCandidate().signal).not.toBe(createBudgetCandidate().signal)
	})
})
