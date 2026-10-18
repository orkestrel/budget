import type { MeterInterface, MeterOptions } from '@src/core'
import { Meter } from '@src/core'
import { preview } from '@orkestrel/contract'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { captureError, createRecorder } from '@orkestrel/test'
import {
	ReadingProxy,
	captureContractError,
	createRecordingBudget,
	defineThrowingProperty,
	requireBudgetError,
	selectCharge,
	selectLength,
} from '../../setup.js'

describe('Meter construction boundary', () => {
	it.each([
		['undefined', undefined],
		['null', null],
		['an array', []],
	])('rejects %s options with exact bound context', (_label, value) => {
		const error = captureContractError(() => Reflect.construct(Meter, [value]))

		expect(error.code).toBe('bound')
		expect(error.message).toBe('Meter: options must be a plain record')
		expect(error.context).toEqual({
			path: ['options'],
			limit: 'plain record',
			received: preview(value),
		})
	})

	it('contains unreadable options and preserves the cause', () => {
		const options = defineThrowingProperty(
			{ estimator: selectLength, producer: selectCharge },
			'budget',
		)
		const error = captureContractError(() => Reflect.construct(Meter, [options]))

		expect(error.code).toBe('bound')
		expect(error.context).toEqual({
			path: ['options'],
			limit: 'readable plain record',
			received: 'object',
		})
		expect(error.cause instanceof TypeError).toBe(true)
	})

	it('reads each option exactly once, in declaration order', () => {
		const { budget } = createRecordingBudget<number>(10, selectCharge)
		const { proxy, reads } = new ReadingProxy<MeterOptions<number>>({
			budget,
			estimator: selectLength,
			producer: selectCharge,
		})

		const meter = new Meter<number>(proxy)
		meter.charge('abc')

		expect(reads).toEqual(['budget', 'estimator', 'producer'])
		expect(budget.consumed).toBe(3)
	})

	it.each([
		['a plain object holding only consume', { consume: selectCharge }],
		['null', null],
		['a number', 7],
		['an almost-complete budget', { id: 'x', max: 1, consumed: 0 }],
	])('rejects %s as the budget with exact placement context', (_label, budget) => {
		const error = captureContractError(() =>
			Reflect.construct(Meter, [{ budget, estimator: selectLength, producer: selectCharge }]),
		)

		expect(error.code).toBe('placement')
		expect(error.message).toBe('Meter: budget must implement BudgetInterface')
		expect(error.context).toEqual({
			path: ['options', 'budget'],
			limit: 'BudgetInterface',
			received: preview(budget),
		})
	})

	it('contains a revoked budget proxy', () => {
		const { budget } = createRecordingBudget<number>(10, selectCharge)
		const revoked = Proxy.revocable(budget, {})
		revoked.revoke()
		const error = captureContractError(() =>
			Reflect.construct(Meter, [
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

	it.each([
		[
			'estimator',
			{ estimator: 'length', producer: selectCharge },
			'Meter: estimator must be a function',
		],
		['producer', { estimator: selectLength, producer: 3 }, 'Meter: producer must be a function'],
	])('rejects a non-function %s with exact placement context', (key, rest, message) => {
		const { budget } = createRecordingBudget<number>(10, selectCharge)
		const options = { budget, ...rest }
		const error = captureContractError(() => Reflect.construct(Meter, [options]))

		expect(error.code).toBe('placement')
		expect(error.message).toBe(message)
		expect(error.context).toEqual({
			path: ['options', key],
			limit: 'function',
			received: preview(Reflect.get(options, key)),
		})
	})
})

describe('Meter charging', () => {
	it('charges the growth of the estimate per delta, in producer order', () => {
		const { budget, charges } = createRecordingBudget<number>(100, selectCharge)
		const meter = new Meter<number>({ budget, estimator: selectLength, producer: selectCharge })

		meter.charge('ab')
		meter.charge('cde')
		meter.charge('f')

		expect(charges.calls).toEqual([[2], [3], [1]])
		expect(budget.consumed).toBe(6)
		expect(meter.charged).toBe(6)
	})

	it('hands the producer exactly the growth and consumes what it builds', () => {
		const { budget, charges } = createRecordingBudget<{ readonly tokens: number }>(
			100,
			(value) => value.tokens,
		)
		const meter = new Meter<{ readonly tokens: number }>({
			budget,
			estimator: selectLength,
			producer: (charge) => ({ tokens: charge }),
		})

		meter.charge('abcd')
		meter.charge('ef')

		expect(charges.calls).toEqual([[{ tokens: 4 }], [{ tokens: 2 }]])
	})

	it('measures the cumulative text, never the delta alone', () => {
		const { budget } = createRecordingBudget<number>(100, selectCharge)
		const texts = createRecorder<readonly [string]>()
		const meter = new Meter<number>({
			budget,
			estimator: (text) => {
				texts.handler(text)
				return text.length
			},
			producer: selectCharge,
		})

		meter.charge('he')
		meter.charge('llo')

		expect(texts.calls).toEqual([['he'], ['hello']])
	})

	it('charges nothing when the estimate does not grow', () => {
		const { budget, charges } = createRecordingBudget<number>(100, selectCharge)
		const meter = new Meter<number>({
			budget,
			estimator: (text) => Math.ceil(text.length / 4),
			producer: selectCharge,
		})

		meter.charge('a')
		meter.charge('b')
		meter.charge('')
		meter.charge('cd')

		expect(charges.calls).toEqual([[1]])
		expect(meter.charged).toBe(1)
	})

	it('keeps the largest accepted estimate when the estimator decreases', () => {
		const { budget, charges } = createRecordingBudget<number>(100, selectCharge)
		const meter = new Meter<number>({
			budget,
			estimator: (text) => text.length % 3,
			producer: selectCharge,
		})

		meter.charge('a')
		meter.charge('b')
		meter.charge('c')
		meter.charge('d')

		expect(charges.calls).toEqual([[1], [1]])
		expect(meter.charged).toBe(2)
		expect(budget.consumed).toBe(2)
	})

	it('charges nothing for a zero estimate and starts with nothing charged', () => {
		const { budget, charges } = createRecordingBudget<number>(100, selectCharge)
		const meter = new Meter<number>({ budget, estimator: selectLength, producer: selectCharge })

		expect(meter.charged).toBe(0)
		meter.charge('')

		expect(charges.count).toBe(0)
		expect(meter.charged).toBe(0)
	})
})

describe('Meter failure atomicity', () => {
	it('rethrows a budget failure by identity and measures the next growth from the last accepted estimate', () => {
		const failure = new Error('budget refused')
		const { budget, charges } = createRecordingBudget<number>(100, (value) => {
			if (value === 2) throw failure
			return value
		})
		const meter = new Meter<number>({ budget, estimator: selectLength, producer: selectCharge })
		meter.charge('a')

		expect(captureError(() => meter.charge('bc'))).toBe(failure)
		expect(meter.charged).toBe(1)
		expect(budget.consumed).toBe(1)

		meter.charge('d')

		expect(charges.calls).toEqual([[1], [2], [3]])
		expect(meter.charged).toBe(4)
		expect(budget.consumed).toBe(4)
	})

	it('rethrows a producer failure by identity and leaves the budget untouched', () => {
		const failure = new Error('producer refused')
		const { budget, charges } = createRecordingBudget<number>(100, selectCharge)
		const meter = new Meter<number>({
			budget,
			estimator: selectLength,
			producer: (charge) => {
				if (charge === 2) throw failure
				return charge
			},
		})
		meter.charge('a')

		expect(captureError(() => meter.charge('bc'))).toBe(failure)
		expect(meter.charged).toBe(1)
		expect(budget.consumed).toBe(1)

		meter.charge('d')

		expect(charges.calls).toEqual([[1], [3]])
		expect(meter.charged).toBe(4)
	})

	it('rethrows an estimator failure by identity and counts the failed delta', () => {
		const failure = new Error('estimator refused')
		const { budget, charges } = createRecordingBudget<number>(100, selectCharge)
		const meter = new Meter<number>({
			budget,
			estimator: (text) => {
				if (text === 'abc') throw failure
				return text.length
			},
			producer: selectCharge,
		})
		meter.charge('a')

		expect(captureError(() => meter.charge('bc'))).toBe(failure)
		expect(meter.charged).toBe(1)

		meter.charge('d')

		expect(charges.calls).toEqual([[1], [3]])
		expect(meter.charged).toBe(4)
	})

	it('gives a refused growth back exactly, without rounding drift', () => {
		// 0.6 - 0.5 is 0.09999999999999998, so subtracting the refused growth from the claim
		// cannot restore the previous 0.1; the restore must set the previous value itself.
		const { budget } = createRecordingBudget<number>(100, (value) => {
			if (value === 0.5) throw new Error('budget refused')
			return value
		})
		const meter = new Meter<number>({
			budget,
			estimator: (text) => (text.length === 1 ? 0.1 : 0.6),
			producer: selectCharge,
		})
		meter.charge('a')

		expect(captureError(() => meter.charge('b'))).toBeInstanceOf(Error)
		expect(meter.charged).toBe(0.1)
		expect(budget.consumed).toBe(0.1)
	})

	it('keeps a refused estimate delta counted and measures the next growth from the text that includes it', () => {
		const { budget, charges } = createRecordingBudget<number>(100, selectCharge)
		const meter = new Meter<number>({
			budget,
			estimator: (text) => (text === 'abc' ? Number.NaN : text.length),
			producer: selectCharge,
		})
		meter.charge('a')

		expect(captureContractError(() => meter.charge('bc')).code).toBe('range')
		expect(meter.charged).toBe(1)

		meter.charge('d')

		expect(charges.calls).toEqual([[1], [3]])
		expect(meter.charged).toBe(4)
		expect(budget.consumed).toBe(4)
	})

	it.each([
		['NaN', Number.NaN],
		['a negative estimate', -1],
		['positive infinity', Number.POSITIVE_INFINITY],
		['negative infinity', Number.NEGATIVE_INFINITY],
	])('refuses %s with exact range context and charges nothing', (_label, estimate) => {
		const { budget, charges } = createRecordingBudget<number>(100, selectCharge)
		const meter = new Meter<number>({
			budget,
			estimator: () => estimate,
			producer: selectCharge,
		})
		const error = captureContractError(() => meter.charge('abc'))

		expect(error.code).toBe('range')
		expect(error.message).toBe('Meter.charge: estimate must be finite and nonnegative')
		expect(error.context).toEqual({
			path: ['estimate'],
			limit: 'finite nonnegative number',
			received: preview(estimate),
		})
		expect(charges.count).toBe(0)
		expect(meter.charged).toBe(0)
		expect(budget.consumed).toBe(0)
	})

	it.each([
		['a number', 7],
		['null', null],
		['undefined', undefined],
		['an array', ['a']],
		['an object', { text: 'a' }],
	])('refuses %s as a delta before any state changes', (_label, delta) => {
		const { budget, charges } = createRecordingBudget<number>(100, selectCharge)
		const texts = createRecorder<readonly [string]>()
		const meter = new Meter<number>({
			budget,
			estimator: (text) => {
				texts.handler(text)
				return text.length
			},
			producer: selectCharge,
		})
		const error = captureContractError(() => Reflect.apply(meter.charge, meter, [delta]))

		expect(error.code).toBe('literal')
		expect(error.message).toBe('Meter.charge: delta must be a string')
		expect(error.context).toEqual({
			path: ['delta'],
			limit: 'string',
			received: preview(delta),
		})
		expect(texts.count).toBe(0)
		expect(charges.count).toBe(0)

		meter.charge('x')

		expect(texts.calls).toEqual([['x']])
		expect(charges.calls).toEqual([[1]])
	})
})

describe('Meter re-entry', () => {
	it('reaches the serial result when an abort listener charges the meter at the crossing', () => {
		const { budget, charges } = createRecordingBudget<number>(1, selectCharge)
		const meter = new Meter<number>({ budget, estimator: selectLength, producer: selectCharge })
		budget.signal.addEventListener('abort', () => meter.charge('b'))

		meter.charge('a')

		expect(charges.calls).toEqual([[1], [1]])
		expect(budget.consumed).toBe(2)
		expect(meter.charged).toBe(2)
	})

	it('reaches the serial result when a listener charges a growth on top of the crossing charge', () => {
		const { budget, charges } = createRecordingBudget<number>(2, selectCharge)
		const meter = new Meter<number>({ budget, estimator: selectLength, producer: selectCharge })
		budget.signal.addEventListener('abort', () => meter.charge('c'))

		meter.charge('ab')

		expect(charges.calls).toEqual([[2], [1]])
		expect(budget.consumed).toBe(3)
		expect(meter.charged).toBe(3)
	})

	it('reaches the serial result when the producer charges the meter', () => {
		const { budget, charges } = createRecordingBudget<number>(100, selectCharge)
		const meter = new Meter<number>({
			budget,
			estimator: selectLength,
			producer: (growth) => {
				if (growth === 2) meter.charge('xyz')
				return growth
			},
		})

		meter.charge('ab')

		expect(charges.calls).toEqual([[3], [2]])
		expect(budget.consumed).toBe(5)
		expect(meter.charged).toBe(5)
	})

	it.each([
		['the producer', true],
		['the budget', false],
	])(
		'leaves charged equal to what the budget accepted when a nested charge precedes a refusal by %s',
		(_label, inProducer) => {
			const failure = new Error('refused')
			const { budget, charges } = createRecordingBudget<number>(100, (value) => {
				if (value === 2 && !inProducer) throw failure
				return value
			})
			const meter = new Meter<number>({
				budget,
				estimator: selectLength,
				producer: (growth) => {
					if (growth === 2) {
						meter.charge('xyz')
						if (inProducer) throw failure
					}
					return growth
				},
			})

			expect(captureError(() => meter.charge('ab'))).toBe(failure)
			expect(budget.consumed).toBe(3)
			expect(meter.charged).toBe(3)

			meter.charge('d')

			expect(charges.calls.at(-1)).toEqual([3])
			expect(budget.consumed).toBe(6)
			expect(meter.charged).toBe(6)
		},
	)

	it('ends with charged equal to the budget tally when two nested charges precede the refusals that unwind them', () => {
		// The estimates 1, 1e16, and 1e16 + 2 sit where the doubles are 2 apart, so a refused growth
		// subtracted from a later claim cannot land on the value the budget accepted.
		const failure = new Error('refused')
		const estimates = new Map([
			[1, 1],
			[2, 1e16],
			[3, 1e16 + 2],
		])
		const { budget } = createRecordingBudget<number>(Number.MAX_VALUE, selectCharge)
		const depths = createRecorder<readonly [number]>()
		const meter = new Meter<number>({
			budget,
			estimator: (text) => estimates.get(text.length) ?? 0,
			producer: (growth) => {
				depths.handler(growth)
				const depth = depths.count
				if (depth === 1) captureError(() => meter.charge('b'))
				if (depth === 2) {
					meter.charge('c')
					throw failure
				}
				return growth
			},
		})

		meter.charge('a')

		expect(depths.count).toBe(3)
		expect(meter.charged).toBe(budget.consumed)
	})

	it('ends with charged equal to the budget tally when a nested fractional charge precedes the refusal of the outer growth', () => {
		const failure = new Error('refused')
		const estimates = new Map([
			[1, 0.1],
			[2, 0.6],
			[3, 0.7],
		])
		const { budget } = createRecordingBudget<number>(100, selectCharge)
		const meter = new Meter<number>({
			budget,
			estimator: (text) => estimates.get(text.length) ?? 0,
			producer: (growth) => {
				if (growth === 0.5) {
					meter.charge('c')
					throw failure
				}
				return growth
			},
		})
		meter.charge('a')

		expect(captureError(() => meter.charge('b'))).toBe(failure)
		expect(budget.consumed).toBeGreaterThan(0.1)
		expect(meter.charged).toBe(budget.consumed)
	})

	it('keeps charged equal to the budget tally through repeated fractional refusals', () => {
		const failure = new Error('refused')
		const estimates = new Map([
			[1, 0.1],
			[2, 0.6],
			[3, 0.9],
			[4, 1.3],
			[5, 1.6],
			[6, 0.25],
		])
		const { budget } = createRecordingBudget<number>(100, (value) => {
			if (value > 0.3) throw failure
			return value
		})
		const meter = new Meter<number>({
			budget,
			estimator: (text) => estimates.get(text.length) ?? 0,
			producer: selectCharge,
		})
		meter.charge('a')

		for (const delta of ['b', 'c', 'd', 'e']) {
			expect(captureError(() => meter.charge(delta))).toBe(failure)
			expect(budget.consumed).toBe(0.1)
			expect(meter.charged).toBe(0.1)
		}

		meter.charge('f')

		expect(budget.consumed).toBeGreaterThan(0.1)
		expect(meter.charged).toBe(budget.consumed)
	})

	it('reads only the growth the budget accepted while a charge is in flight', () => {
		const { budget } = createRecordingBudget<number>(100, selectCharge)
		const seen = createRecorder<readonly [number]>()
		const meter = new Meter<number>({
			budget,
			estimator: selectLength,
			producer: (growth) => {
				seen.handler(meter.charged)
				return growth
			},
		})

		meter.charge('ab')
		meter.charge('c')

		expect(seen.calls).toEqual([[0], [2]])
		expect(meter.charged).toBe(3)
	})
})

describe('Meter budget signal', () => {
	it('trips the budget signal once, at the charge that reaches the ceiling', () => {
		const { budget } = createRecordingBudget<number>(3, selectCharge)
		const fired = createRecorder<readonly []>()
		budget.signal.addEventListener('abort', fired.handler)
		const meter = new Meter<number>({ budget, estimator: selectLength, producer: selectCharge })

		meter.charge('ab')
		expect(budget.signal.aborted).toBe(false)
		meter.charge('cd')
		meter.charge('ef')

		expect(fired.count).toBe(1)
		expect(requireBudgetError(budget.signal.reason).context).toEqual({
			id: budget.id,
			max: 3,
			consumed: 4,
		})
		expect(meter.charged).toBe(6)
	})
})

describe('Meter shape', () => {
	it('implements the meter contract', () => {
		expectTypeOf<Meter<number>>().toExtend<MeterInterface>()
		expectTypeOf<MeterInterface>().toHaveProperty('charged').toEqualTypeOf<number>()
		expectTypeOf<MeterInterface['charge']>().toEqualTypeOf<(delta: string) => void>()
	})

	it('exposes exactly charged and charge, with no reset', () => {
		expect(Object.getOwnPropertyNames(Meter.prototype)).toEqual([
			'constructor',
			'charged',
			'charge',
		])
	})
})
