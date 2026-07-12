import type { BudgetInterface, BudgetOptions, TokenBudgetOptions, TokenUsage } from './types.js'
import { Budget } from './Budget.js'

/**
 * Create a cost handle — a running tally against `max` whose `AbortSignal` fires
 * when the ceiling is reached, for racing against work exactly like a `Timeout`
 * deadline.
 *
 * @remarks
 * Call `consume(value)` to charge the tally by `options.consume(value)`; when
 * cumulative `consumed` reaches `max` the handle's `signal` fires and `exhausted`
 * flips `true`. Call `start()` to re-arm a fresh per-request `signal` without
 * resetting the cumulative `consumed`, or `clear()` to reset the tally to `0` AND
 * re-arm a fresh non-aborted `signal` (the §10 reset — start the next window from
 * zero). When `options.signal` is given, a parent
 * abort ALSO fires `signal` (linked via `AbortSignal.any`). Pass `options.id` to
 * label the handle for tracing, or let it default to a random UUID. `max` should be
 * a non-negative finite number; `max: 0` is exhausted from the first `start()`.
 *
 * @param options - `max` (the ceiling, a non-negative finite number), `consume` (a
 *   function extracting the numeric amount to charge from a domain value), an
 *   optional `id` (a trace label; defaults to a random UUID), and an optional parent
 *   `signal` whose abort also fires the budget's signal
 * @returns A working {@link BudgetInterface}
 *
 * @example
 * ```ts
 * import { createBudget } from '@src/core'
 *
 * const budget = createBudget<number>({ max: 10_000, consume: (cost) => cost })
 * budget.start()
 * budget.signal.addEventListener('abort', () => stop(), { once: true })
 * budget.consume(4_000) // remaining 6_000
 * budget.consume(7_000) // crosses the ceiling — fires `signal`
 * ```
 */
export function createBudget<T>(options: BudgetOptions<T>): BudgetInterface<T> {
	return new Budget(options)
}

/**
 * Create a token budget — a {@link BudgetInterface} over {@link TokenUsage} that
 * charges one usage field per provider call, the canonical LLM cost ceiling.
 *
 * @remarks
 * A convenience over {@link createBudget} whose `consume` reads the chosen `scope`
 * field of each {@link TokenUsage} (`'completion'` by default, or `'total'` /
 * `'prompt'`). `consume(usage)` per provider response accumulates the spend; when it
 * reaches `max` the handle's `signal` fires. Fold `signal` into an agent loop's bound
 * via `AbortSignal.any` to stop generating once the budget is spent. `start()`
 * re-arms a fresh per-request signal without resetting the cumulative spend; pass a
 * parent `signal` so an external cancel also fires it.
 *
 * @param options - `max` (the token ceiling), an optional `scope` (which usage field
 *   to charge — `'completion'` default / `'total'` / `'prompt'`), an optional `id`
 *   (a trace label; defaults to a random UUID), and an optional parent `signal`
 * @returns A working {@link BudgetInterface} over {@link TokenUsage}
 *
 * @example
 * ```ts
 * import { createTokenBudget } from '@src/core'
 *
 * const abort = new AbortController()
 * const budget = createTokenBudget({ max: 50_000, scope: 'total' })
 * budget.start()
 * // Fold the budget into the loop's bound alongside an external cancel.
 * const bound = AbortSignal.any([abort.signal, budget.signal])
 * while (!bound.aborted) {
 * 	const usage = await callProvider() // → { prompt, completion, total }
 * 	budget.consume(usage) // fires `budget.signal` once the ceiling is crossed
 * }
 * ```
 */
export function createTokenBudget(options: TokenBudgetOptions): BudgetInterface<TokenUsage> {
	return createBudget({ ...options, consume: (usage) => usage[options.scope ?? 'completion'] })
}
