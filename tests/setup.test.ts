// The proof for `tests/setup.ts`, the workspace's host-independent test setup module.
// Its subject is the exported test-infrastructure behavior the consuming suites rely on,
// one case per behavioral contract. Production behavior — what `Budget` refuses and what
// it charges — is proven by the suites under `tests/src/core/`, never re-proven here.

import { describe, expect, it } from 'vitest'
import { ContractError } from '@orkestrel/contract'
import {
	captureContractError,
	createReadingProxy,
	createTokenUsage,
	defineThrowingProperty,
	selectCharge,
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

describe('createReadingProxy', () => {
	it('records every property read in read order and returns the target values', () => {
		const { proxy, reads } = createReadingProxy({ max: 10, scope: 'total' })

		expect(reads).toEqual([])
		expect(proxy.scope).toBe('total')
		expect(proxy.max).toBe(10)
		// The log is the same live array the proxy appends to, so a read that happens after
		// the helper returned is still visible here.
		expect(reads).toEqual(['scope', 'max'])
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
