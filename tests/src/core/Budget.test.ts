import type { BudgetErrorContext, BudgetInterface, BudgetOptions } from '@src/core'
import { Budget, BudgetError, isBudgetError } from '@src/core'
import { ContractError, preview } from '@orkestrel/contract'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { captureError, createRecorder } from '@orkestrel/test'
import {
	captureContractError,
	defineThrowingProperty,
	requireBudgetError,
	selectCharge,
} from '../../setup.js'

describe('Budget construction boundary', () => {
	it.each([
		['undefined', undefined],
		['null', null],
		['an array', []],
	])('rejects %s options with exact bound context', (_label, value) => {
		const error = captureContractError(() => Reflect.construct(Budget, [value]))

		expect(error.code).toBe('bound')
		expect(error.context).toEqual({
			path: ['options'],
			limit: 'plain record',
			received: preview(value),
		})
	})

	it('contains unreadable options and preserves the cause', () => {
		const options = defineThrowingProperty({ consumer: selectCharge }, 'max')
		const error = captureContractError(() => Reflect.construct(Budget, [options]))

		expect(error.code).toBe('bound')
		expect(error.context).toEqual({
			path: ['options'],
			limit: 'readable plain record',
			received: 'object',
		})
		expect(error.cause instanceof TypeError).toBe(true)
	})

	it('rejects a defined non-string id with exact literal context', () => {
		const error = captureContractError(() =>
			Reflect.construct(Budget, [{ id: 7, max: 10, consumer: selectCharge }]),
		)

		expect(error.code).toBe('literal')
		expect(error.context).toEqual({
			path: ['options', 'id'],
			limit: 'string or undefined',
			received: '7',
		})
	})

	it.each([
		['negative infinity', Number.NEGATIVE_INFINITY],
		['positive infinity', Number.POSITIVE_INFINITY],
		['NaN', Number.NaN],
		['a negative number', -1],
	])('rejects %s max with exact range context', (_label, value) => {
		const error = captureContractError(() =>
			Reflect.construct(Budget, [{ max: value, consumer: selectCharge }]),
		)

		expect(error.code).toBe('range')
		expect(error.context).toEqual({
			path: ['options', 'max'],
			limit: 'finite nonnegative number',
			received: preview(value),
		})
	})

	it('rejects a non-function consumer with exact placement context', () => {
		const error = captureContractError(() =>
			Reflect.construct(Budget, [{ max: 10, consumer: 'ten' }]),
		)

		expect(error.code).toBe('placement')
		expect(error.context).toEqual({
			path: ['options', 'consumer'],
			limit: 'function',
			received: '"ten"',
		})
	})

	it.each([
		['null', null],
		['a plain object', {}],
		['a spoof', { aborted: false }],
	])('rejects %s parent signal with exact placement context', (_label, signal) => {
		const error = captureContractError(() =>
			Reflect.construct(Budget, [{ max: 10, consumer: selectCharge, signal }]),
		)

		expect(error.code).toBe('placement')
		expect(error.context).toEqual({
			path: ['options', 'signal'],
			limit: 'native AbortSignal or undefined',
			received: preview(signal),
		})
	})

	it('contains a revoked parent signal proxy', () => {
		const revoked = Proxy.revocable(new AbortController().signal, {})
		revoked.revoke()

		expect(() =>
			Reflect.construct(Budget, [{ max: 10, consumer: selectCharge, signal: revoked.proxy }]),
		).toThrow(ContractError)
	})

	it('accepts fractional, zero, and negative-zero ceilings', () => {
		const fraction = new Budget<number>({ max: 1.5, consumer: selectCharge })
		const zero = new Budget<number>({ max: 0, consumer: selectCharge })
		const negativeZero = new Budget<number>({ max: -0, consumer: selectCharge })

		expect(fraction.max).toBe(1.5)
		expect(zero.exhausted).toBe(true)
		expect(zero.signal.aborted).toBe(false)
		expect(Object.is(negativeZero.max, -0)).toBe(true)
		expect(negativeZero.signal.aborted).toBe(false)
	})

	it('preserves an empty id and generates only for undefined', () => {
		const empty = new Budget<number>({ id: '', max: 10, consumer: selectCharge })
		const generated = new Budget<number>({ max: 10, consumer: selectCharge })
		const other = new Budget<number>({ max: 10, consumer: selectCharge })

		expect(empty.id).toBe('')
		expect(generated.id.length > 0).toBe(true)
		expect(generated.id).not.toBe(other.id)
	})

	it('refuses a runtime write to id and keeps the value', () => {
		const budget = new Budget<number>({ id: 'first', max: 10, consumer: selectCharge })

		expect(Reflect.set(budget, 'id', 'other')).toBe(false)
		expect(budget.id).toBe('first')
	})
})

describe('Budget consumption', () => {
	it('accumulates finite nonnegative integer and fractional charges', () => {
		const budget = new Budget<number>({ max: 10, consumer: selectCharge })

		budget.consume(0)
		budget.consume(1.25)
		budget.consume(2.5)

		expect(budget.consumed).toBe(3.75)
		expect(budget.remaining).toBe(6.25)
		expect(budget.exhausted).toBe(false)
		expect(budget.signal.aborted).toBe(false)
	})

	it('trips exactly once at the ceiling and permits valid overshoot', () => {
		const budget = new Budget<number>({ max: 10, consumer: selectCharge })
		const fired = createRecorder<readonly [unknown]>()
		budget.signal.addEventListener('abort', () => fired.handler(budget.signal.reason))

		budget.consume(9)
		expect(budget.signal.aborted).toBe(false)
		budget.consume(2)
		budget.consume(5)

		expect(budget.consumed).toBe(16)
		expect(budget.remaining).toBe(0)
		expect(budget.exhausted).toBe(true)
		expect(fired.calls).toEqual([[new BudgetError({ id: budget.id, max: 10, consumed: 11 })]])
	})

	it.each([
		['a negative charge', -1],
		['NaN', Number.NaN],
		['positive infinity', Number.POSITIVE_INFINITY],
		['negative infinity', Number.NEGATIVE_INFINITY],
	])('rejects %s atomically', (_label, charge) => {
		const budget = new Budget<number>({ max: 100, consumer: () => charge })
		const signal = budget.signal
		const error = captureContractError(() => budget.consume(1))

		expect(error.code).toBe('range')
		expect(error.context).toEqual({
			path: ['charge'],
			limit: 'finite nonnegative number',
			received: preview(charge),
		})
		expect(budget.consumed).toBe(0)
		expect(budget.signal).toBe(signal)
		expect(budget.signal.aborted).toBe(false)
	})

	it('preserves consumer throw identity and leaves state unchanged', () => {
		const failure = new Error('consumer failed')
		const budget = new Budget<number>({
			max: 100,
			consumer: () => {
				throw failure
			},
		})
		const signal = budget.signal
		const error = captureError(() => budget.consume(1))

		expect(error).toBe(failure)
		expect(budget.consumed).toBe(0)
		expect(budget.signal).toBe(signal)
		expect(budget.signal.aborted).toBe(false)
	})

	it('rejects nonfinite tally overflow atomically', () => {
		const budget = new Budget<number>({ max: Number.MAX_VALUE, consumer: selectCharge })
		const charge = Number.MAX_VALUE * 0.75
		budget.consume(charge)
		const signal = budget.signal
		const error = captureContractError(() => budget.consume(charge))

		expect(error.code).toBe('range')
		expect(error.context).toEqual({
			path: ['consumed'],
			limit: 'finite number',
			received: 'Infinity',
		})
		expect(budget.consumed).toBe(charge)
		expect(budget.signal).toBe(signal)
		expect(budget.signal.aborted).toBe(false)
	})

	it('uses a domain consumer before committing its returned charge', () => {
		const budget = new Budget<{ readonly weight: number }>({
			max: 10,
			consumer: (value) => value.weight,
		})

		budget.consume({ weight: 4 })
		budget.consume({ weight: 6 })

		expect(budget.consumed).toBe(10)
		expect(budget.exhausted).toBe(true)
		expect(budget.signal.aborted).toBe(true)
	})
})

describe('Budget lifecycle', () => {
	it('supports consume before start on the construction signal', () => {
		const budget = new Budget<number>({ max: 10, consumer: selectCharge })
		const signal = budget.signal
		const fired = createRecorder<readonly [unknown]>()
		signal.addEventListener('abort', () => fired.handler(signal.reason))

		budget.consume(10)

		expect(budget.signal).toBe(signal)
		expect(budget.consumed).toBe(10)
		expect(budget.exhausted).toBe(true)
		expect(fired.calls).toEqual([[new BudgetError({ id: budget.id, max: 10, consumed: 10 })]])
	})

	it('start re-arms without resetting cumulative consumption', () => {
		const budget = new Budget<number>({ max: 10, consumer: selectCharge })
		budget.consume(4)
		const first = budget.signal

		budget.start()

		expect(budget.signal).not.toBe(first)
		expect(first.aborted).toBe(false)
		expect(budget.signal.aborted).toBe(false)
		expect(budget.consumed).toBe(4)
		budget.consume(6)
		expect(budget.signal.aborted).toBe(true)
	})

	it('start on an exhausted budget re-arms immediately aborted', () => {
		const budget = new Budget<number>({ max: 10, consumer: selectCharge })
		budget.consume(11)
		const first = budget.signal

		budget.start()

		expect(budget.signal).not.toBe(first)
		expect(budget.signal.aborted).toBe(true)
		expect(budget.consumed).toBe(11)
		expect(budget.exhausted).toBe(true)
	})

	it('clear resets the tally and re-arms a reusable signal', () => {
		const budget = new Budget<number>({ max: 10, consumer: selectCharge })
		budget.consume(10)
		const exhausted = budget.signal

		budget.clear()

		expect(budget.signal).not.toBe(exhausted)
		expect(budget.signal.aborted).toBe(false)
		expect(budget.consumed).toBe(0)
		expect(budget.remaining).toBe(10)
		expect(budget.exhausted).toBe(false)
		budget.consume(10)
		expect(budget.signal.aborted).toBe(true)
	})

	it('zero is derived exhausted but aborts only on start or consume', () => {
		const started = new Budget<number>({ max: 0, consumer: selectCharge })
		const consumed = new Budget<number>({ max: 0, consumer: selectCharge })

		expect(started.exhausted).toBe(true)
		expect(started.signal.aborted).toBe(false)
		started.start()
		expect(started.signal.aborted).toBe(true)

		expect(consumed.exhausted).toBe(true)
		expect(consumed.signal.aborted).toBe(false)
		consumed.consume(0)
		expect(consumed.signal.aborted).toBe(true)
	})

	it('clear restores the zero-ceiling born state until the next operation', () => {
		const budget = new Budget<number>({ max: 0, consumer: selectCharge })
		budget.start()
		expect(budget.signal.aborted).toBe(true)

		budget.clear()

		expect(budget.consumed).toBe(0)
		expect(budget.exhausted).toBe(true)
		expect(budget.signal.aborted).toBe(false)
		budget.consume(0)
		expect(budget.signal.aborted).toBe(true)
	})
})

describe('Budget parent composition', () => {
	it('parent aborts the exposed signal without exhausting the tally', () => {
		const parent = new AbortController()
		const reason = new Error('cancelled')
		const budget = new Budget<number>({ max: 10, consumer: selectCharge, signal: parent.signal })

		parent.abort(reason)

		expect(budget.signal.aborted).toBe(true)
		expect(budget.signal.reason).toBe(reason)
		expect(budget.exhausted).toBe(false)
		expect(budget.consumed).toBe(0)
	})

	it('an already-aborted parent supplies the construction reason', () => {
		const parent = new AbortController()
		const reason = new Error('already cancelled')
		parent.abort(reason)

		const budget = new Budget<number>({ max: 10, consumer: selectCharge, signal: parent.signal })

		expect(budget.signal.aborted).toBe(true)
		expect(budget.signal.reason).toBe(reason)
		expect(budget.exhausted).toBe(false)
	})

	it('start and clear recompose the same parent with its reason', () => {
		const parent = new AbortController()
		const reason = new Error('late cancellation')
		const budget = new Budget<number>({ max: 10, consumer: selectCharge, signal: parent.signal })

		budget.start()
		const started = budget.signal
		budget.clear()
		const cleared = budget.signal
		expect(cleared).not.toBe(started)

		parent.abort(reason)

		expect(cleared.aborted).toBe(true)
		expect(cleared.reason).toBe(reason)
		expect(budget.consumed).toBe(0)
	})

	it('own exhaustion aborts while a live parent remains intact', () => {
		const parent = new AbortController()
		const budget = new Budget<number>({ max: 10, consumer: selectCharge, signal: parent.signal })

		budget.consume(10)

		expect(budget.signal.aborted).toBe(true)
		expect(budget.exhausted).toBe(true)
		expect(parent.signal.aborted).toBe(false)
		expect(requireBudgetError(budget.signal.reason).context.consumed).toBe(10)
	})
})

describe('Budget exhaustion reason', () => {
	it('aborts at the crossing with a BudgetError carrying the exact readings', () => {
		const budget = new Budget<number>({ id: 'tokens', max: 10, consumer: selectCharge })

		budget.consume(10)
		const reason = requireBudgetError(budget.signal.reason)

		expect(reason.name).toBe('BudgetError')
		expect(reason.code).toBe('exhaust')
		expect(reason.message).toBe('budget reached its ceiling')
		expect(reason.context).toEqual({ id: 'tokens', max: 10, consumed: 10 })
	})

	it('records the overshot tally of the charge that crossed', () => {
		const budget = new Budget<number>({ id: 'tokens', max: 10, consumer: selectCharge })

		budget.consume(9)
		budget.consume(5)
		budget.consume(7)

		expect(requireBudgetError(budget.signal.reason).context).toEqual({
			id: 'tokens',
			max: 10,
			consumed: 14,
		})
		expect(budget.consumed).toBe(21)
	})

	it('start on an exhausted budget arms a fresh BudgetError with the current tally', () => {
		const budget = new Budget<number>({ id: 'tokens', max: 10, consumer: selectCharge })
		budget.consume(11)
		const crossing = budget.signal.reason

		budget.start()
		const armed = requireBudgetError(budget.signal.reason)

		expect(armed).not.toBe(crossing)
		expect(armed.context).toEqual({ id: 'tokens', max: 10, consumed: 11 })
	})

	it('names the generated id when none was supplied', () => {
		const budget = new Budget<number>({ max: 0, consumer: selectCharge })

		budget.start()

		expect(requireBudgetError(budget.signal.reason).context).toEqual({
			id: budget.id,
			max: 0,
			consumed: 0,
		})
	})

	it('keeps the parent reason when the parent aborts and relabels nothing', () => {
		const parent = new AbortController()
		const cancelled = new Error('cancelled')
		const budget = new Budget<number>({ max: 10, consumer: selectCharge, signal: parent.signal })

		parent.abort(cancelled)

		expect(budget.signal.reason).toBe(cancelled)
		expect(isBudgetError(budget.signal.reason)).toBe(false)
	})

	// The guard in `consume` reads the composed signal, so an aborted parent is never relabelled
	// with the budget's own reason. This case tells that guard from one that reads the owned
	// controller only on a host whose `AbortSignal.any` propagates a parent abort lazily, to the
	// composite when something reads it. Where propagation is eager, as on Node 24.22.0, the two
	// guards are equivalent and the case holds for both.
	it('keeps the parent reason when the parent was aborted before the budget crossed', () => {
		const parent = new AbortController()
		const cancelled = new Error('cancelled first')
		const budget = new Budget<number>({ max: 10, consumer: selectCharge, signal: parent.signal })
		parent.abort(cancelled)

		budget.consume(10)

		expect(budget.exhausted).toBe(true)
		expect(budget.signal.reason).toBe(cancelled)
	})

	it('keeps the parent reason when start arms an exhausted budget under an aborted parent', () => {
		const parent = new AbortController()
		const cancelled = new Error('cancelled before start')
		const budget = new Budget<number>({ max: 10, consumer: selectCharge, signal: parent.signal })
		budget.consume(10)
		parent.abort(cancelled)

		budget.start()

		expect(budget.signal.reason).toBe(cancelled)
	})

	it('reaches an AbortSignal.any composition as the identical reason', () => {
		const budget = new Budget<number>({ max: 10, consumer: selectCharge })
		const bound = AbortSignal.any([new AbortController().signal, budget.signal])

		budget.consume(10)

		expect(bound.reason).toBe(budget.signal.reason)
		expect(isBudgetError(bound.reason)).toBe(true)
	})

	it('narrows only a BudgetError with isBudgetError', () => {
		const lookalike = Object.assign(new Error('budget reached its ceiling'), { code: 'exhaust' })
		const revoked = Proxy.revocable(new BudgetError({ id: 'a', max: 1, consumed: 1 }), {})
		revoked.revoke()

		expect(isBudgetError(new BudgetError({ id: 'a', max: 1, consumed: 1 }))).toBe(true)
		expect(isBudgetError(new DOMException('aborted', 'AbortError'))).toBe(false)
		expect(isBudgetError(lookalike)).toBe(false)
		expect(isBudgetError(null)).toBe(false)
		expect(isBudgetError(undefined)).toBe(false)
		expect(isBudgetError(revoked.proxy)).toBe(false)
	})
})

describe('Budget type shape', () => {
	it('preserves the public generic lifecycle contract', () => {
		expectTypeOf<BudgetInterface<number>>().toHaveProperty('id').toEqualTypeOf<string>()
		expectTypeOf<BudgetInterface<number>>().toHaveProperty('signal').toEqualTypeOf<AbortSignal>()
		expectTypeOf<BudgetInterface<number>>().toHaveProperty('max').toEqualTypeOf<number>()
		expectTypeOf<BudgetInterface<number>>().toHaveProperty('consumed').toEqualTypeOf<number>()
		expectTypeOf<BudgetInterface<number>>().toHaveProperty('remaining').toEqualTypeOf<number>()
		expectTypeOf<BudgetInterface<number>>().toHaveProperty('exhausted').toEqualTypeOf<boolean>()
		expectTypeOf<BudgetInterface<number>['start']>().toEqualTypeOf<() => void>()
		expectTypeOf<BudgetInterface<number>['consume']>().toEqualTypeOf<(value: number) => void>()
		expectTypeOf<BudgetInterface<number>['clear']>().toEqualTypeOf<() => void>()
		expectTypeOf<BudgetOptions<number>['consumer']>().toEqualTypeOf<(value: number) => number>()
	})

	it('types the exhaustion error with a literal code and the exact readings', () => {
		expectTypeOf<BudgetError['code']>().toEqualTypeOf<'exhaust'>()
		expectTypeOf<BudgetError['context']>().toEqualTypeOf<BudgetErrorContext>()
		expectTypeOf<BudgetErrorContext>().toEqualTypeOf<{
			readonly id: string
			readonly max: number
			readonly consumed: number
		}>()
		expectTypeOf(isBudgetError).guards.toEqualTypeOf<BudgetError>()
	})
})
