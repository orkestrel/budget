import type { BudgetInterface, BudgetOptions } from './types.js'

/**
 * A cost handle — a running tally against `max` whose `AbortSignal` fires when the
 * ceiling is reached, for racing against work exactly like a `Timeout` deadline.
 *
 * @remarks
 * - **Ceiling signal.** `consume(value)` charges the tally by `consume(value)`; the
 *   moment cumulative `consumed` reaches `max`, a private controller aborts and
 *   `signal` fires. Race `signal` against work to cap how much that work may spend
 *   (tokens, bytes, calls). The trip is idempotent — consuming further once exhausted
 *   never re-aborts.
 * - **Cumulative tally, per-request signal.** `consumed` only ever grows; it is the
 *   lifetime spend. `start()` re-arms a FRESH `signal` for the next request WITHOUT
 *   resetting `consumed` — the ceiling stays the same running total across requests,
 *   so a budget already at or past `max` arms an immediately-aborted signal (the
 *   re-arm guard, mirroring how `Timeout.start` honors an already-aborted parent).
 * - **`clear()` resets the tally (§10).** `clear()` is the §10 reset — like `start()`
 *   it re-arms a fresh non-aborted `signal`, but it ALSO zeroes `#consumed`, so the
 *   budget returns to its born state: `consumed === 0`, `remaining === max`,
 *   `exhausted === false`, `signal.aborted === false`. It is the ceiling action a
 *   measure-since-an-event budget wants — consume toward `max`, and on crossing it
 *   take the action then `clear()` to start the next window from zero (e.g. an agent
 *   loop's compact-and-continue), the counterpart to `start()`'s spend-across-requests.
 * - **Parent linking.** When `options.signal` is given, the exposed `signal` is
 *   `AbortSignal.any([own, parent])`, so it fires on EITHER exhaustion OR the parent
 *   aborting — without re-implementing listener wiring. The composite is computed
 *   once per `start()` (and at construction) and stored, never recomputed per read,
 *   mirroring how `Abort` exposes its composite. A parent that has ALREADY aborted
 *   makes the current `signal` born aborted (carrying the parent's reason).
 * - **Event-free.** A pure functional primitive — no Emitter, no events. `max` should
 *   be a non-negative finite number; `max: 0` is a budget that is exhausted from the
 *   first `start()` / `consume`.
 *
 * @example
 * ```ts
 * const budget = new Budget<number>({ max: 1_000, consume: (n) => n })
 * budget.start()
 * budget.signal.addEventListener('abort', () => stop(), { once: true })
 * budget.consume(400) // remaining 600
 * budget.consume(700) // crosses 1_000 — fires `signal`
 * ```
 */
export class Budget<T> implements BudgetInterface<T> {
	readonly id: string
	readonly #max: number
	readonly #consumer: (value: T) => number
	readonly #parent: AbortSignal | undefined
	#consumed = 0
	#controller = new AbortController()
	#signal: AbortSignal

	constructor(options: BudgetOptions<T>) {
		this.id = options.id ?? crypto.randomUUID()
		this.#max = options.max
		this.#consumer = options.consume
		this.#parent = options.signal
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
		// Re-arm a fresh per-request signal; the cumulative tally is left untouched.
		this.#controller = new AbortController()
		this.#signal = this.#compose()
		// Already at or past the ceiling — the re-armed signal is born exhausted, so a
		// new request opened on a spent budget is bounded from the very first tick.
		if (this.#consumed >= this.#max) this.#controller.abort()
	}

	consume(value: T): void {
		this.#consumed += this.#consumer(value)
		// Trip exactly once on crossing the ceiling; aborting again is a no-op anyway.
		if (this.#consumed >= this.#max && !this.#controller.signal.aborted) {
			this.#controller.abort()
		}
	}

	clear(): void {
		// The §10 reset: zero the cumulative tally AND re-arm a fresh non-aborted signal, so
		// the budget returns to its born state (consumed 0, remaining max, not exhausted, a
		// fresh un-tripped controller). Unlike start() — which re-arms but PRESERVES the
		// running total — clear() wipes #consumed first, so the re-arm guard sees 0 < max and
		// leaves the new signal un-aborted (a positive max), opening the next window from zero.
		this.#consumed = 0
		this.#controller = new AbortController()
		this.#signal = this.#compose()
	}

	// The exposed signal — the own controller alone, or `AbortSignal.any([own, parent])`
	// when parented (so a parent abort fires it too), computed once per arm.
	#compose(): AbortSignal {
		return this.#parent === undefined
			? this.#controller.signal
			: AbortSignal.any([this.#controller.signal, this.#parent])
	}
}
