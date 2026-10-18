import type { BudgetInterface, MeterInterface, MeterOptions } from './types.js'
import { ContractError, isString, preview } from '@orkestrel/contract'
import { validateMeterOptions } from './helpers.js'
import { isBudgetAmount } from './validators.js'

/**
 * Implements `MeterInterface` for one stream, charging a budget the growth of the
 * streamed text's estimated cost as each delta arrives.
 *
 * @remarks
 * One meter serves one stream and has no reset. `charge(delta)` refuses a
 * non-string delta with a `literal`-coded ContractError before any state
 * changes. It then counts the delta, estimates the whole text, and refuses a
 * nonfinite or negative estimate with a `range`-coded ContractError. It measures
 * the estimate's growth over the growth the budget has accepted plus the growth
 * of every charge still in flight, and consumes `producer(growth)` only when that
 * growth is positive. Each charge in flight holds a per-call claim of its growth
 * from before the producer runs until the charge settles, so a charge that
 * re-enters the meter synchronously, through the producer, the budget's consumer,
 * or an abort listener the crossing fires, measures its own growth past the
 * claims and the nested and outer charges sum to the serial result. `charged`
 * raises by a charge's growth only after the budget's `consume` returns, and a
 * throw from the producer or the budget drops the claim and raises nothing, so
 * `charged` is the sum of the growth the budget accepted from this meter and, for
 * a budget this meter alone charges, equals its `consumed` exactly in serial use,
 * under re-entry through the producer or the budget's consumer, and under every
 * refusal. A nested charge an abort listener makes adds its growth before the
 * outer charge's, while the budget added the outer first, so with growths that
 * are not integers the two sums can differ in the last digit. A throw from the
 * estimator, or a refused estimate, claims nothing. Every refusal leaves the
 * delta counted, and the next charge measures the growth from the text that
 * includes it. The meter calls the estimator once per delta with the whole text,
 * so an estimator that reads only the text's length keeps each charge
 * constant-time.
 *
 * @example
 * ```ts
 * import { Meter, createBudget } from '@orkestrel/budget'
 *
 * const budget = createBudget<number>({ max: 100, consumer: (tokens) => tokens })
 * const meter = new Meter<number>({
 * 	budget,
 * 	estimator: (text) => Math.ceil(text.length / 4),
 * 	producer: (charge) => charge,
 * })
 * meter.charge('hello') // estimate 2 — consumes 2
 * meter.charge('!') // estimate still 2 — charges nothing
 * meter.charged // 2
 * ```
 */
export class Meter<T> implements MeterInterface {
	readonly #budget: BudgetInterface<T>
	readonly #estimator: MeterOptions<T>['estimator']
	readonly #producer: MeterOptions<T>['producer']
	// The charges in flight, one frozen claim of its growth each: added before the producer
	// runs and deleted on every way the charge settles.
	readonly #claims = new Set<{ readonly growth: number }>()
	#text = ''
	#accepted = 0

	constructor(options: MeterOptions<T>) {
		const input = validateMeterOptions(options)
		this.#budget = input.budget
		this.#estimator = input.estimator
		this.#producer = input.producer
	}

	get charged(): number {
		return this.#accepted
	}

	charge(delta: string): void {
		if (!isString(delta)) {
			throw new ContractError('Meter.charge: delta must be a string', {
				code: 'literal',
				context: { path: ['delta'], limit: 'string', received: preview(delta) },
			})
		}
		this.#text += delta
		const estimate = this.#estimator(this.#text)
		if (!isBudgetAmount(estimate)) {
			throw new ContractError('Meter.charge: estimate must be finite and nonnegative', {
				code: 'range',
				context: {
					path: ['estimate'],
					limit: 'finite nonnegative number',
					received: preview(estimate),
				},
			})
		}
		const pending = [...this.#claims].reduce((sum, claim) => sum + claim.growth, 0)
		const growth = estimate - (this.#accepted + pending)
		if (growth <= 0) return
		// The producer and the budget run user code that can re-enter this meter, so the
		// claim stands until the charge settles and a nested charge measures past it.
		const claim = Object.freeze({ growth })
		this.#claims.add(claim)
		try {
			this.#budget.consume(this.#producer(growth))
			this.#accepted += growth
		} finally {
			this.#claims.delete(claim)
		}
	}
}
