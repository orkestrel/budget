import type { BudgetInterface, BudgetOptions } from './types.js'
import { ContractError, preview } from '@orkestrel/contract'
import { validateBudgetOptions } from './helpers.js'
import { isBudgetAmount } from './validators.js'

/**
 * A cumulative cost handle whose native `AbortSignal` aborts at its ceiling.
 *
 * @remarks
 * `consume(value)` invokes the configured consumer before changing state, then
 * atomically commits a finite nonnegative charge. A consumer throw retains its
 * original identity. Invalid charges and nonfinite tally overflow throw a
 * `range`-coded {@link import('@orkestrel/contract').ContractError} without
 * changing the tally or signal.
 *
 * `start()` re-arms without resetting cumulative consumption; `clear()` resets
 * the tally and re-arms. Consumption before `start()` remains supported. The
 * exposed signal composes the owned exhaustion controller with an optional
 * native parent signal, preserving the first abort reason.
 *
 * @example
 * ```ts
 * import { Budget } from '@orkestrel/budget'
 *
 * const budget = new Budget<number>({ max: 1_000, consumer: (value) => value })
 * budget.consume(400)
 * budget.consume(700)
 * ```
 */
export class Budget<T> implements BudgetInterface<T> {
	readonly id: string
	readonly #max: number
	readonly #consumer: BudgetOptions<T>['consumer']
	readonly #parent: AbortSignal | undefined
	#consumed = 0
	#controller: AbortController
	#signal: AbortSignal

	constructor(options: BudgetOptions<T>) {
		const input = validateBudgetOptions(options)
		this.id = input.id === undefined ? crypto.randomUUID() : input.id
		this.#max = input.max
		this.#consumer = input.consumer
		this.#parent = input.signal
		this.#controller = new AbortController()
		this.#signal = this.#compose()
	}

	get signal(): AbortSignal {
		return this.#signal
	}

	get max(): number {
		return this.#max
	}

	get consumed(): number {
		return this.#consumed
	}

	get remaining(): number {
		return Math.max(0, this.#max - this.#consumed)
	}

	get exhausted(): boolean {
		return this.#consumed >= this.#max
	}

	start(): void {
		this.#controller = new AbortController()
		this.#signal = this.#compose()
		if (this.exhausted) this.#controller.abort()
	}

	consume(value: T): void {
		const charge = this.#consumer(value)
		if (!isBudgetAmount(charge)) {
			throw new ContractError('Budget.consume: charge must be finite and nonnegative', {
				code: 'range',
				context: {
					path: ['charge'],
					limit: 'finite nonnegative number',
					received: preview(charge),
				},
			})
		}
		const consumed = this.#consumed + charge
		if (!isBudgetAmount(consumed)) {
			throw new ContractError('Budget.consume: cumulative tally must remain finite', {
				code: 'range',
				context: {
					path: ['consumed'],
					limit: 'finite number',
					received: preview(consumed),
				},
			})
		}

		this.#consumed = consumed
		if (this.exhausted && !this.#controller.signal.aborted) this.#controller.abort()
	}

	clear(): void {
		this.#consumed = 0
		this.#controller = new AbortController()
		this.#signal = this.#compose()
	}

	#compose(): AbortSignal {
		return this.#parent === undefined
			? this.#controller.signal
			: AbortSignal.any([this.#controller.signal, this.#parent])
	}
}
