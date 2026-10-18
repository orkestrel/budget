import type {
	BudgetInterface,
	BudgetOptions,
	MeterInterface,
	TokenBudgetOptions,
	TokenMeterOptions,
	TokenScope,
	TokenUsage,
} from './types.js'
import { ContractError, preview, readValue } from '@orkestrel/contract'
import { Budget } from './Budget.js'
import { Meter } from './Meter.js'
import { validateTokenBudgetOptions, validateTokenMeterOptions } from './helpers.js'
import { isBudgetAmount, isTokenScope, isTokenUsage } from './validators.js'

/**
 * Creates a cumulative budget as a `BudgetInterface<T>` over a `max` ceiling and a
 * `consumer`, whose native signal aborts the moment the tally reaches that ceiling.
 *
 * @remarks
 * An optional trace `id` labels the handle, and an optional parent `signal` composes
 * with the budget's own exhaustion signal.
 *
 * @param options - Strict budget construction options
 * @returns A reusable cumulative budget
 * @throws {@link import('@orkestrel/contract').ContractError} When the
 *   JavaScript input does not satisfy `BudgetOptions`
 *
 * @example Race work against the ceiling
 * ```ts
 * import { createBudget } from '@orkestrel/budget'
 *
 * const budget = createBudget<number>({ max: 1_000_000, consumer: (bytes) => bytes })
 * budget.start()
 * budget.signal.addEventListener('abort', () => abortStream(), { once: true })
 *
 * for await (const chunk of stream) {
 * 	if (budget.signal.aborted) break // the ceiling was crossed mid-stream
 * 	budget.consume(chunk.byteLength)
 * 	process(chunk)
 * }
 * ```
 *
 * @example
 * ```ts
 * import { createBudget } from '@orkestrel/budget'
 *
 * const budget = createBudget<number>({ max: 10_000, consumer: (cost) => cost })
 * budget.consume(4_000)
 * ```
 */
export function createBudget<T>(options: BudgetOptions<T>): BudgetInterface<T> {
	return new Budget(options)
}

/**
 * Creates a validated unary consumer that charges one selected `TokenUsage` field.
 *
 * @param scope - Token usage field to charge
 * @returns A consumer that validates usage and returns the selected charge
 * @throws {@link import('@orkestrel/contract').ContractError} When `scope` or
 *   consumed token usage is invalid
 *
 * @example
 * ```ts
 * const consumer = createTokenConsumer('total')
 * consumer({ prompt: 100, completion: 15, total: 115 }) // 115
 * ```
 */
export function createTokenConsumer(scope: TokenScope): BudgetOptions<TokenUsage>['consumer'] {
	if (!isTokenScope(scope)) {
		throw new ContractError('createTokenConsumer: scope is not supported', {
			code: 'literal',
			context: {
				path: ['scope'],
				limit: "'completion' | 'total' | 'prompt'",
				received: preview(scope),
			},
		})
	}
	return (usage) => {
		if (!isTokenUsage(usage)) {
			throw new ContractError('Token consumer: usage must have valid token counts', {
				code: 'placement',
				context: {
					path: ['usage'],
					limit: 'finite nonnegative prompt, completion, and total',
					received: preview(usage),
				},
			})
		}

		const charge = readValue(() => Reflect.get(usage, scope), 'Token consumer', {
			subject: 'selected charge',
			code: 'placement',
			context: {
				path: ['usage', scope],
				limit: 'readable finite nonnegative number',
				received: preview(usage),
			},
		})
		if (!isBudgetAmount(charge)) {
			throw new ContractError('Token consumer: selected charge must be valid', {
				code: 'range',
				context: {
					path: ['usage', scope],
					limit: 'finite nonnegative number',
					received: preview(charge),
				},
			})
		}
		return charge
	}
}

/**
 * Creates a token budget as a `BudgetInterface<TokenUsage>` charging one validated
 * `scope` field per provider call.
 *
 * @remarks
 * `scope` selects `completion`, `total`, or `prompt`. Default: `completion`.
 * Construction validates its own untyped boundary before composing the generic
 * budget.
 *
 * @param options - Strict token-budget construction options
 * @returns A reusable cumulative token budget
 * @throws {@link import('@orkestrel/contract').ContractError} When the
 *   JavaScript input does not satisfy `TokenBudgetOptions`
 *
 * @example
 * ```ts
 * import { createTokenBudget } from '@orkestrel/budget'
 *
 * const budget = createTokenBudget({ max: 50_000, scope: 'total' })
 * budget.consume({ prompt: 100, completion: 400, total: 500 })
 * ```
 */
export function createTokenBudget(options: TokenBudgetOptions): BudgetInterface<TokenUsage> {
	const input = validateTokenBudgetOptions(options)
	const consumer = createTokenConsumer(input.scope ?? 'completion')
	return createBudget({
		...(input.id === undefined ? {} : { id: input.id }),
		max: input.max,
		consumer,
		...(input.signal === undefined ? {} : { signal: input.signal }),
	})
}

/**
 * Creates a token meter as a `MeterInterface` that charges a token budget each
 * growth of a streamed answer's estimated token count as completion tokens.
 *
 * @remarks
 * Each growth `n` is consumed as `{ prompt: 0, completion: n, total: n }`, so a
 * `completion`- or `total`-scoped budget tracks the stream before the provider
 * reports its usage, and `charged` is the completion estimate that report is
 * reconciled against. Construction validates its own untyped boundary before
 * composing the generic meter.
 *
 * @param options - Strict token-meter construction options
 * @returns A meter for one streamed answer
 * @throws {@link import('@orkestrel/contract').ContractError} When the
 *   JavaScript input does not satisfy `TokenMeterOptions`
 *
 * @example Meter a streamed answer
 * ```ts
 * import { createTokenBudget, createTokenMeter } from '@orkestrel/budget'
 *
 * const budget = createTokenBudget({ max: 1_000, scope: 'completion' })
 * const meter = createTokenMeter({ budget, estimator: (text) => Math.ceil(text.length / 4) })
 * meter.charge('Once upon') // estimate 3 — consumes 3 completion tokens
 * meter.charge(' a') // estimate still 3 — charges nothing
 * meter.charge(' time') // estimate 4 — consumes 1 more
 * budget.consumed // 4
 * ```
 */
export function createTokenMeter(options: TokenMeterOptions): MeterInterface {
	const input = validateTokenMeterOptions(options)
	return new Meter<TokenUsage>({
		budget: input.budget,
		estimator: input.estimator,
		producer: (charge) => ({ prompt: 0, completion: charge, total: charge }),
	})
}
