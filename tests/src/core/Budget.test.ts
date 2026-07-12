import type { TokenUsage } from '@src/core'
import { Budget } from '@src/core'
import { describe, expect, it } from 'vitest'
import { createRecorder } from '../../setup.js'

// Budget — a cumulative cost tally whose AbortSignal fires at a ceiling, the third
// bounding signal beside Abort and Timeout. Tally-driven, not time-driven, so no
// timers: every trip is synchronous (AGENTS §16, real signals, no mocks).

// A plain numeric consumer — charge the value itself — for the core tally tests.
const identity = (value: number): number => value

describe('Budget', () => {
	it('exposes id and max', () => {
		const budget = new Budget<number>({ id: 'tokens-1', max: 100, consume: identity })

		expect(budget.id).toBe('tokens-1')
		expect(budget.max).toBe(100)
	})

	it('a fresh budget is not exhausted and its signal has not fired', () => {
		const budget = new Budget<number>({ max: 100, consume: identity })

		expect(budget.exhausted).toBe(false)
		expect(budget.consumed).toBe(0)
		expect(budget.remaining).toBe(100)
		expect(budget.signal.aborted).toBe(false)
	})

	it('consume accumulates; consumed / remaining / exhausted track each step', () => {
		const budget = new Budget<number>({ max: 100, consume: identity })

		budget.consume(30)
		expect(budget.consumed).toBe(30)
		expect(budget.remaining).toBe(70)
		expect(budget.exhausted).toBe(false)

		budget.consume(50)
		expect(budget.consumed).toBe(80)
		expect(budget.remaining).toBe(20)
		expect(budget.exhausted).toBe(false)
	})

	it('signal fires exactly when consumed reaches max — not before', () => {
		const budget = new Budget<number>({ max: 100, consume: identity })
		const fired = createRecorder<readonly []>()
		budget.signal.addEventListener('abort', fired.handler)

		budget.consume(99)
		// One unit short of the ceiling — still armed, not fired.
		expect(budget.exhausted).toBe(false)
		expect(budget.signal.aborted).toBe(false)
		expect(fired.count).toBe(0)

		budget.consume(1)
		// Exactly at the ceiling (>=) — the signal trips now.
		expect(budget.consumed).toBe(100)
		expect(budget.remaining).toBe(0)
		expect(budget.exhausted).toBe(true)
		expect(budget.signal.aborted).toBe(true)
		expect(fired.count).toBe(1)
	})

	it('a single large consume that overshoots max trips the signal once', () => {
		const budget = new Budget<number>({ max: 100, consume: identity })
		const fired = createRecorder<readonly []>()
		budget.signal.addEventListener('abort', fired.handler)

		budget.consume(250)

		expect(budget.consumed).toBe(250)
		// remaining floors at 0 — never negative — even when overshot.
		expect(budget.remaining).toBe(0)
		expect(budget.exhausted).toBe(true)
		expect(budget.signal.aborted).toBe(true)
		expect(fired.count).toBe(1)
	})

	it('consuming past max keeps the signal aborted (idempotent, no double-abort)', () => {
		const budget = new Budget<number>({ max: 100, consume: identity })
		const fired = createRecorder<readonly []>()
		budget.signal.addEventListener('abort', fired.handler)

		budget.consume(100) // trips
		budget.consume(50) // already exhausted — must not re-fire
		budget.consume(50)

		expect(budget.consumed).toBe(200)
		expect(budget.exhausted).toBe(true)
		expect(budget.signal.aborted).toBe(true)
		// Crossing the ceiling fires once; further consumption never re-aborts.
		expect(fired.count).toBe(1)
	})

	it('start() re-arms a fresh non-aborted signal WITHOUT resetting consumed', () => {
		const budget = new Budget<number>({ max: 100, consume: identity })

		budget.consume(100) // exhaust + trip
		expect(budget.signal.aborted).toBe(true)
		const exhaustedSignal = budget.signal

		// Lower the tally below the ceiling, then re-arm: the cumulative spend is
		// preserved, but the new per-request signal is fresh and not aborted.
		// (consumed is cumulative; start re-arms only the signal — so first prove the
		// re-arm is fresh by consuming a fraction after a sub-ceiling state.)
		const fresh = new Budget<number>({ max: 100, consume: identity })
		fresh.consume(40)
		fresh.start()
		expect(fresh.consumed).toBe(40) // NOT reset
		expect(fresh.signal.aborted).toBe(false) // a fresh, un-tripped signal

		// And the exhausted budget's start() swaps in a different signal instance.
		budget.start()
		expect(budget.signal).not.toBe(exhaustedSignal)
		expect(budget.consumed).toBe(100) // still cumulative
	})

	it('clear() resets the tally to 0 AND re-arms a fresh non-aborted signal — consume can refill', () => {
		// The §10 reset (distinct from start(), which preserves the cumulative spend): consume to
		// exhausted, then clear() — consumed is zeroed, remaining is back to max, exhausted flips
		// false, the signal is a fresh un-aborted instance, and consuming again can re-trip toward
		// the SAME ceiling (the compact-and-continue primitive an agent's context window uses).
		const budget = new Budget<number>({ max: 100, consume: identity })

		budget.consume(120) // overshoot the ceiling
		expect(budget.exhausted).toBe(true)
		expect(budget.signal.aborted).toBe(true)
		const exhaustedSignal = budget.signal

		budget.clear()

		// Reset to the born state: tally 0, full headroom, not exhausted, a fresh un-tripped signal.
		expect(budget.consumed).toBe(0)
		expect(budget.remaining).toBe(100)
		expect(budget.exhausted).toBe(false)
		expect(budget.signal).not.toBe(exhaustedSignal)
		expect(budget.signal.aborted).toBe(false)

		// And the window opens again — consuming toward the ceiling trips the fresh signal anew.
		const fired = createRecorder<readonly []>()
		budget.signal.addEventListener('abort', fired.handler)
		budget.consume(60)
		expect(budget.exhausted).toBe(false)
		expect(budget.signal.aborted).toBe(false)
		budget.consume(40) // 60 + 40 = 100 crosses the ceiling on this post-clear() signal
		expect(budget.consumed).toBe(100)
		expect(budget.exhausted).toBe(true)
		expect(budget.signal.aborted).toBe(true)
		expect(fired.count).toBe(1)
	})

	it('start() when already exhausted (consumed >= max) immediately aborts the fresh signal', () => {
		const budget = new Budget<number>({ max: 100, consume: identity })

		budget.consume(120) // over the ceiling
		expect(budget.exhausted).toBe(true)
		const firstSignal = budget.signal

		budget.start()

		// The re-arm guard: a request opened on a spent budget is born exhausted, so
		// the new signal is a DIFFERENT instance that is already aborted.
		expect(budget.signal).not.toBe(firstSignal)
		expect(budget.signal.aborted).toBe(true)
		expect(budget.exhausted).toBe(true)
		expect(budget.consumed).toBe(120)
	})

	it('start() on a sub-ceiling budget can later trip the fresh signal by consuming again', () => {
		const budget = new Budget<number>({ max: 100, consume: identity })

		budget.consume(60)
		budget.start()
		const firstFired = createRecorder<readonly []>()
		budget.signal.addEventListener('abort', firstFired.handler)
		expect(budget.signal.aborted).toBe(false)

		// The cumulative tally crosses the ceiling on this request's signal.
		budget.consume(40)
		expect(budget.consumed).toBe(100)
		expect(budget.signal.aborted).toBe(true)
		expect(firstFired.count).toBe(1)
	})

	// ── Parent linking + composition (the agent-loop pattern) ────────────────────

	it('a parent abort fires budget.signal independent of consumption', () => {
		const parent = new AbortController()
		const budget = new Budget<number>({ max: 100, consume: identity, signal: parent.signal })
		const fired = createRecorder<readonly []>()
		budget.signal.addEventListener('abort', fired.handler)

		expect(budget.signal.aborted).toBe(false)

		parent.abort()

		// The composite (AbortSignal.any) fires on the parent — even though nothing
		// was consumed and the budget itself is NOT exhausted.
		expect(budget.signal.aborted).toBe(true)
		expect(budget.exhausted).toBe(false)
		expect(budget.consumed).toBe(0)
		expect(fired.count).toBe(1)
	})

	it('exhaustion still fires when the parent never aborts', () => {
		const parent = new AbortController()
		const budget = new Budget<number>({ max: 100, consume: identity, signal: parent.signal })

		budget.consume(100)

		// The own controller trips the composite without the parent ever firing.
		expect(budget.signal.aborted).toBe(true)
		expect(budget.exhausted).toBe(true)
		expect(parent.signal.aborted).toBe(false)
	})

	it('a parent already aborted at construction makes the signal born aborted', () => {
		const parent = new AbortController()
		const parentReason = new Error('request cancelled')
		parent.abort(parentReason)

		const budget = new Budget<number>({ max: 100, consume: identity, signal: parent.signal })

		// AbortSignal.any over an already-aborted source is born aborted, carrying the
		// parent's reason — a budget opened under a cancelled request.
		expect(budget.signal.aborted).toBe(true)
		expect(budget.signal.reason).toBe(parentReason)
		expect(budget.exhausted).toBe(false)
	})

	it('composes with an Abort via AbortSignal.any — the abort trips the combined signal first', () => {
		const parent = new AbortController()
		const budget = new Budget<number>({ max: 100, consume: identity })
		// The agent-loop bound: combine an external cancel with the budget signal.
		const bound = AbortSignal.any([parent.signal, budget.signal])
		const fired = createRecorder<readonly []>()
		bound.addEventListener('abort', fired.handler)

		expect(bound.aborted).toBe(false)

		parent.abort('user stopped')

		// The cancel wins the race — the combined signal fires though the budget is intact.
		expect(bound.aborted).toBe(true)
		expect(budget.exhausted).toBe(false)
		expect(fired.count).toBe(1)
	})

	it('composes with a budget that exhausts first — the combined signal fires on the ceiling', () => {
		const parent = new AbortController()
		const budget = new Budget<number>({ max: 100, consume: identity })
		const bound = AbortSignal.any([parent.signal, budget.signal])
		const fired = createRecorder<readonly []>()
		bound.addEventListener('abort', fired.handler)

		budget.consume(100) // the budget trips first

		expect(bound.aborted).toBe(true)
		expect(parent.signal.aborted).toBe(false)
		expect(fired.count).toBe(1)
	})

	it('parent-link composite does not accumulate live signals across start() cycles', () => {
		// The L1 leak-safety concern: each start() recomputes a fresh AbortSignal.any
		// over the parent. The Budget exposes exactly ONE live signal at a time — each
		// start() swaps the previous out — so it cannot accumulate a growing set of its
		// own composites (the prior arm's signal is dropped, not retained). AbortSignal.any
		// registers no observable JS listener on the parent (it uses an internal native
		// dependency tracked via WeakRef, not addEventListener), so there is nothing to
		// pile up on the parent through the public API either. We assert the observable
		// truth: the exposed signal is replaced each arm, and after heavy churn the
		// CURRENT composite still fires correctly when the parent aborts.
		const parent = new AbortController()
		const budget = new Budget<number>({ max: 100, consume: identity, signal: parent.signal })

		let previous = budget.signal
		for (let cycle = 0; cycle < 1_000; cycle += 1) {
			budget.start()
			// Each arm yields a distinct composite — the old one is no longer the live
			// signal, so the Budget holds a single signal, never an accumulating list.
			expect(budget.signal).not.toBe(previous)
			previous = budget.signal
		}

		// After a thousand cycles the single live composite still fires from the parent.
		const fired = createRecorder<readonly []>()
		budget.signal.addEventListener('abort', fired.handler)
		parent.abort()
		expect(budget.signal.aborted).toBe(true)
		expect(fired.count).toBe(1)
	})

	// ── Boundaries: max, ids, reason ─────────────────────────────────────────────

	it('max: 0 is exhausted on the first consume', () => {
		const budget = new Budget<number>({ max: 0, consume: identity })
		const fired = createRecorder<readonly []>()
		budget.signal.addEventListener('abort', fired.handler)

		// A zero ceiling means "spend nothing" — already exhausted before any spend.
		expect(budget.exhausted).toBe(true)
		expect(budget.remaining).toBe(0)

		budget.consume(0)
		// consumed (0) >= max (0) — the signal trips on the first charge.
		expect(budget.signal.aborted).toBe(true)
		expect(fired.count).toBe(1)
	})

	it('max: 0 arms an immediately-aborted signal on start()', () => {
		const budget = new Budget<number>({ max: 0, consume: identity })

		budget.start()

		// The re-arm guard: consumed (0) >= max (0), so the fresh signal is born aborted.
		expect(budget.signal.aborted).toBe(true)
		expect(budget.exhausted).toBe(true)
	})

	it('the abort reason on exhaustion is the platform default AbortError', () => {
		const budget = new Budget<number>({ max: 100, consume: identity })

		budget.consume(100)

		// Exhaustion aborts the own controller with no reason — the platform substitutes
		// a default AbortError DOMException (mirrors Abort's no-reason abort()).
		expect(budget.signal.reason instanceof DOMException).toBe(true)
		expect(budget.signal.reason.name).toBe('AbortError')
	})

	it('id is honored when supplied', () => {
		const budget = new Budget<number>({ id: 'job-9', max: 10, consume: identity })

		expect(budget.id).toBe('job-9')
	})

	it('default ids are unique across many instances', () => {
		// A UUID collision would silently alias two unrelated budgets — assert the
		// default id is distinct across a large batch, not just a pair.
		const ids = new Set<string>()
		for (let index = 0; index < 1_000; index += 1) {
			ids.add(new Budget<number>({ max: 10, consume: identity }).id)
		}

		expect(ids.size).toBe(1_000)
	})

	// ── Custom consumer extraction ───────────────────────────────────────────────

	it('charges the amount the consume function extracts from a domain value', () => {
		// A non-identity consumer: charge a field of a record, proving consume(value)
		// is what drives the tally, not the raw value.
		const budget = new Budget<{ readonly cost: number }>({
			max: 50,
			consume: (value) => value.cost,
		})

		budget.consume({ cost: 20 })
		budget.consume({ cost: 20 })
		expect(budget.consumed).toBe(40)
		expect(budget.signal.aborted).toBe(false)

		budget.consume({ cost: 10 })
		expect(budget.consumed).toBe(50)
		expect(budget.signal.aborted).toBe(true)
	})

	it('charges a TokenUsage completion field round-trips through the tally', () => {
		const budget = new Budget<TokenUsage>({ max: 30, consume: (usage) => usage.completion })
		const usage: TokenUsage = { prompt: 100, completion: 15, total: 115 }

		budget.consume(usage)
		expect(budget.consumed).toBe(15)
		budget.consume(usage)
		expect(budget.consumed).toBe(30)
		expect(budget.exhausted).toBe(true)
		expect(budget.signal.aborted).toBe(true)
	})

	// ── Construction-time signal vs. start() (the §10 lifecycle, exhaustively) ────

	it('the construction-time signal IS the live signal before any start()', () => {
		// A budget consumed without ever calling start() trips the construction-time
		// signal — start() is a re-arm, not a prerequisite for consume to fire.
		const budget = new Budget<number>({ max: 50, consume: identity })
		const constructionSignal = budget.signal
		const fired = createRecorder<readonly []>()
		constructionSignal.addEventListener('abort', fired.handler)

		budget.consume(50)

		// The same instance read at construction is the one that aborts — no start() needed.
		expect(budget.signal).toBe(constructionSignal)
		expect(constructionSignal.aborted).toBe(true)
		expect(fired.count).toBe(1)
	})

	it('start() before any consume swaps in a fresh construction-distinct signal (sub-ceiling)', () => {
		const budget = new Budget<number>({ max: 100, consume: identity })
		const constructionSignal = budget.signal

		budget.start()

		// A sub-ceiling start() arms a brand-new, non-aborted signal distinct from the
		// construction-time one — and consumed is still pristine.
		expect(budget.signal).not.toBe(constructionSignal)
		expect(budget.signal.aborted).toBe(false)
		expect(constructionSignal.aborted).toBe(false)
		expect(budget.consumed).toBe(0)
	})

	it('each start() yields a distinct signal and a prior arm never re-aborts the old one', () => {
		// Three back-to-back arms below the ceiling: every arm is a fresh, non-aborted
		// signal, and re-arming does not retroactively abort the signals it replaced.
		const budget = new Budget<number>({ max: 100, consume: identity })
		budget.consume(10)

		const first = budget.signal
		budget.start()
		const second = budget.signal
		budget.start()
		const third = budget.signal

		expect(first).not.toBe(second)
		expect(second).not.toBe(third)
		expect(first.aborted).toBe(false)
		expect(second.aborted).toBe(false)
		expect(third.aborted).toBe(false)
		expect(budget.consumed).toBe(10) // untouched across the arms
	})

	it('a trip on a re-armed signal leaves the pre-start() signal un-aborted', () => {
		// start() then cross the ceiling: only the post-start() signal trips; the signal
		// that was live before the re-arm is dropped and stays clean (no cross-arm bleed).
		const budget = new Budget<number>({ max: 100, consume: identity })
		budget.consume(40)
		const beforeStart = budget.signal

		budget.start()
		const afterStart = budget.signal
		budget.consume(60) // crosses 100 on the re-armed signal

		expect(beforeStart).not.toBe(afterStart)
		expect(beforeStart.aborted).toBe(false) // the replaced signal never fired
		expect(afterStart.aborted).toBe(true)
		expect(budget.exhausted).toBe(true)
	})

	it('a stale (already-tripped) signal stays aborted after a re-arm — it is not reset', () => {
		// The exhausted-signal reference a caller still holds remains aborted forever; the
		// budget swaps a NEW signal in rather than un-aborting the old (signals are one-shot).
		const budget = new Budget<number>({ max: 100, consume: identity })
		budget.consume(100)
		const tripped = budget.signal
		expect(tripped.aborted).toBe(true)

		budget.start() // born aborted (still exhausted), but a different instance

		expect(budget.signal).not.toBe(tripped)
		expect(tripped.aborted).toBe(true) // the old one is untouched, not reset
	})

	// ── Cumulative spend across start() cycles (the per-request session pattern) ──

	it('consumed accumulates across start() boundaries — start() never resets the tally', () => {
		// The session pattern: consume, re-arm for the next request, consume again — the
		// lifetime spend carries forward and eventually trips a per-request signal.
		const budget = new Budget<number>({ max: 100, consume: identity })

		budget.consume(30)
		budget.start()
		expect(budget.consumed).toBe(30)

		budget.consume(30)
		budget.start()
		expect(budget.consumed).toBe(60)
		expect(budget.signal.aborted).toBe(false)

		budget.consume(40) // 60 + 40 = 100 crosses the lifetime ceiling on this request
		expect(budget.consumed).toBe(100)
		expect(budget.exhausted).toBe(true)
		expect(budget.signal.aborted).toBe(true)
	})

	it('start() on a budget exhausted in a PRIOR request arms the new request born aborted', () => {
		// Spend to the ceiling in request 1, re-arm for request 2: the session budget is
		// spent, so request 2 is bounded from its first tick (consumed >= max re-arm guard).
		const budget = new Budget<number>({ max: 100, consume: identity })

		budget.consume(60)
		budget.start()
		budget.consume(60) // 120 — exhausts during request 2's window
		expect(budget.exhausted).toBe(true)

		budget.start() // request 3 opens on a spent session budget
		expect(budget.signal.aborted).toBe(true)
		expect(budget.consumed).toBe(120)
	})

	// ── consume deltas: zero, negative, fractional, NaN/Infinity amounts ──────────

	it('consume(value) whose amount is 0 does not advance the tally or trip the signal', () => {
		const budget = new Budget<number>({ max: 100, consume: identity })

		budget.consume(0)
		budget.consume(0)

		// A zero charge is a genuine no-op against a non-zero ceiling.
		expect(budget.consumed).toBe(0)
		expect(budget.remaining).toBe(100)
		expect(budget.exhausted).toBe(false)
		expect(budget.signal.aborted).toBe(false)
	})

	it('a consumer that returns a negative amount moves the tally backwards (no clamp)', () => {
		// The primitive adds whatever consume() returns verbatim — it does not police a
		// non-monotonic consumer. A negative delta reduces consumed; remaining grows back.
		// (The "only grows" guidance assumes a non-negative consumer, which is the caller's
		// contract; the primitive itself trusts the extractor.)
		const budget = new Budget<number>({ max: 100, consume: identity })

		budget.consume(70)
		expect(budget.consumed).toBe(70)
		budget.consume(-30)
		expect(budget.consumed).toBe(40)
		expect(budget.remaining).toBe(60)
		expect(budget.exhausted).toBe(false)
		expect(budget.signal.aborted).toBe(false)
	})

	it('a negative delta below the ceiling does NOT un-abort an already-tripped signal', () => {
		// Even if a later negative charge pulls consumed back under max, the signal that
		// already tripped stays aborted (AbortSignal is one-shot; exhausted re-reads >= max).
		const budget = new Budget<number>({ max: 100, consume: identity })

		budget.consume(100) // trips
		expect(budget.signal.aborted).toBe(true)
		expect(budget.exhausted).toBe(true)

		budget.consume(-50) // consumed back to 50
		expect(budget.consumed).toBe(50)
		expect(budget.remaining).toBe(50)
		// The live signal cannot un-fire; exhausted now reflects the lowered tally.
		expect(budget.signal.aborted).toBe(true)
		expect(budget.exhausted).toBe(false)
	})

	it('fractional charges accumulate and trip only once the float sum reaches the ceiling', () => {
		// Float drift: 0.1 * 9 lands just under 1 (0.8999…), so the budget is NOT yet
		// exhausted; the next charge crosses it. Pins that the >= compare uses the real sum.
		const budget = new Budget<number>({ max: 1, consume: identity })

		for (let index = 0; index < 9; index += 1) budget.consume(0.1)
		expect(budget.consumed).toBeCloseTo(0.9, 10)
		expect(budget.exhausted).toBe(false) // 0.8999… < 1
		expect(budget.signal.aborted).toBe(false)

		budget.consume(0.2)
		expect(budget.consumed).toBeGreaterThanOrEqual(1)
		expect(budget.exhausted).toBe(true)
		expect(budget.signal.aborted).toBe(true)
	})

	// ── Degenerate max: Infinity, NaN (documented as out-of-contract) ─────────────

	it('max: Infinity is effectively unbounded — finite spend never exhausts it', () => {
		// A practically-infinite ceiling: any finite charge leaves remaining Infinity and
		// the signal armed. Only an Infinity charge could reach it (next test).
		const budget = new Budget<number>({ max: Number.POSITIVE_INFINITY, consume: identity })

		expect(budget.exhausted).toBe(false)
		expect(budget.remaining).toBe(Number.POSITIVE_INFINITY)

		// A large but finite sum (2e307, well shy of float64 overflow) is still < Infinity.
		budget.consume(1e307)
		budget.consume(1e307)
		expect(Number.isFinite(budget.consumed)).toBe(true)
		expect(budget.exhausted).toBe(false) // 2e307 < Infinity
		expect(budget.signal.aborted).toBe(false)
	})

	it('max: Infinity trips only when an Infinity amount is charged', () => {
		const budget = new Budget<number>({ max: Number.POSITIVE_INFINITY, consume: identity })

		budget.consume(Number.POSITIVE_INFINITY)

		// Infinity >= Infinity holds, so the ceiling is reached exactly at an infinite spend.
		expect(budget.consumed).toBe(Number.POSITIVE_INFINITY)
		expect(budget.exhausted).toBe(true)
		expect(budget.signal.aborted).toBe(true)
	})

	it('max: NaN is a never-tripping budget — every >= comparison against NaN is false', () => {
		// NaN is outside the documented "non-negative finite" contract; the honest,
		// observable consequence is a budget that can never exhaust (NaN comparisons are
		// always false) and whose remaining is NaN. Pinned so a future change is deliberate.
		const budget = new Budget<number>({ max: Number.NaN, consume: identity })
		const fired = createRecorder<readonly []>()
		budget.signal.addEventListener('abort', fired.handler)

		expect(budget.exhausted).toBe(false)
		expect(Number.isNaN(budget.remaining)).toBe(true)

		budget.consume(1e9)
		budget.start()
		budget.consume(1e9)

		// Neither a huge charge nor a re-arm can trip a NaN ceiling.
		expect(budget.exhausted).toBe(false)
		expect(budget.signal.aborted).toBe(false)
		expect(fired.count).toBe(0)
	})

	// ── Negative max (born exhausted, mirroring max: 0) ───────────────────────────

	it('negative max is born exhausted with remaining floored at 0', () => {
		// A negative ceiling is degenerate but well-defined: consumed (0) >= max (-5) is
		// true, so the budget reports exhausted immediately; remaining floors at 0, not -5.
		const budget = new Budget<number>({ max: -5, consume: identity })

		expect(budget.exhausted).toBe(true)
		expect(budget.remaining).toBe(0)
		// The construction-time signal is NOT yet aborted (only start()/consume arms it),
		// mirroring the max: 0 boundary exactly.
		expect(budget.signal.aborted).toBe(false)
	})

	it('negative max arms an immediately-aborted signal on start() and trips on first consume', () => {
		const budget = new Budget<number>({ max: -5, consume: identity })

		budget.start()
		expect(budget.signal.aborted).toBe(true) // re-arm guard: consumed (0) >= max (-5)

		const fresh = new Budget<number>({ max: -5, consume: identity })
		const fired = createRecorder<readonly []>()
		fresh.signal.addEventListener('abort', fired.handler)
		fresh.consume(0)
		expect(fresh.signal.aborted).toBe(true)
		expect(fired.count).toBe(1)
	})

	// ── max: 0 — the full lifecycle on a born-exhausted ceiling ───────────────────

	it('max: 0 born-exhausted budget: a flurry of consumes trips exactly once', () => {
		// Idempotence at the zero ceiling: every consume satisfies 0 >= 0, but the trip
		// is guarded so only the first crossing fires the signal.
		const budget = new Budget<number>({ max: 0, consume: identity })
		const fired = createRecorder<readonly []>()
		budget.signal.addEventListener('abort', fired.handler)

		budget.consume(0)
		budget.consume(5)
		budget.consume(0)

		expect(budget.signal.aborted).toBe(true)
		expect(fired.count).toBe(1)
	})

	// ── Idempotent trip under a flurry on a normal ceiling ────────────────────────

	it('a flurry of ceiling-crossing consumes fires the signal exactly once', () => {
		// Hammer the budget well past max with many charges — the abort event must fire a
		// single time on the first crossing, never per-charge.
		const budget = new Budget<number>({ max: 100, consume: identity })
		const fired = createRecorder<readonly []>()
		budget.signal.addEventListener('abort', fired.handler)

		for (let index = 0; index < 50; index += 1) budget.consume(50)

		expect(budget.consumed).toBe(2_500)
		expect(budget.exhausted).toBe(true)
		expect(fired.count).toBe(1)
	})

	// ── Parent linking: re-link across start(), reason precedence, both-fire ──────

	it('a fresh start() re-links the SAME parent so a later parent abort fires the new signal', () => {
		// The composite is recomputed once per start(); re-arming must re-attach the parent
		// dependency so a parent abort AFTER the re-arm still trips the current signal.
		const parent = new AbortController()
		const budget = new Budget<number>({ max: 100, consume: identity, signal: parent.signal })

		budget.start() // recompute AbortSignal.any over the same parent
		const reArmed = budget.signal
		const fired = createRecorder<readonly []>()
		reArmed.addEventListener('abort', fired.handler)
		expect(reArmed.aborted).toBe(false)

		parent.abort('late cancel')

		// The post-start() composite still observes the parent — the link was re-established.
		expect(reArmed.aborted).toBe(true)
		expect(budget.signal).toBe(reArmed)
		expect(fired.count).toBe(1)
	})

	it('a parent that aborts mid-request fires the current signal without touching the tally', () => {
		const parent = new AbortController()
		const budget = new Budget<number>({ max: 100, consume: identity, signal: parent.signal })

		budget.start()
		budget.consume(40)
		parent.abort('cancelled mid-flight')

		// The parent path fires the composite even though the budget is far from exhausted.
		expect(budget.signal.aborted).toBe(true)
		expect(budget.exhausted).toBe(false)
		expect(budget.consumed).toBe(40)
	})

	it('exhaustion under a non-aborting parent aborts the OWN controller (born-aborted re-arm holds)', () => {
		// When only the budget exhausts (parent silent), the own controller is what fired —
		// proven by re-arming: the next signal is born aborted from the consumed >= max guard.
		const parent = new AbortController()
		const budget = new Budget<number>({ max: 100, consume: identity, signal: parent.signal })

		budget.consume(100)
		expect(budget.signal.aborted).toBe(true)
		expect(parent.signal.aborted).toBe(false)

		budget.start() // parent still silent — born aborted can ONLY come from the tally guard
		expect(budget.signal.aborted).toBe(true)
		expect(parent.signal.aborted).toBe(false)
	})

	it('a parent aborted at construction makes signal born aborted even with a non-zero max', () => {
		// The construction composite over an already-aborted parent is born aborted carrying
		// the parent's reason, regardless of remaining headroom in the budget.
		const parent = new AbortController()
		const reason = new Error('request already cancelled')
		parent.abort(reason)

		const budget = new Budget<number>({ max: 100, consume: identity, signal: parent.signal })

		expect(budget.signal.aborted).toBe(true)
		expect(budget.signal.reason).toBe(reason)
		expect(budget.exhausted).toBe(false)
		expect(budget.remaining).toBe(100)
	})

	it('an already-aborted parent wins the reason over the budget exhausting afterwards', () => {
		// signal is born aborted from the parent (own controller not yet aborted). A later
		// exhausting consume aborts the own controller, but the composite already fired —
		// idempotent, so the parent's reason stays the exposed reason.
		const parent = new AbortController()
		const parentReason = new Error('parent first')
		parent.abort(parentReason)
		const budget = new Budget<number>({ max: 10, consume: identity, signal: parent.signal })

		budget.consume(10) // own controller aborts with the default AbortError

		expect(budget.exhausted).toBe(true)
		// The composite's reason is the parent's — the first abort observed sticks.
		expect(budget.signal.reason).toBe(parentReason)
	})

	it('when only the budget exhausts under a parent, the reason is the default AbortError', () => {
		// Mirror of the prior test: parent silent, so the own-controller exhaustion abort
		// (no reason) supplies the composite reason — the platform default AbortError.
		const parent = new AbortController()
		const budget = new Budget<number>({ max: 10, consume: identity, signal: parent.signal })

		budget.consume(10)

		expect(budget.signal.aborted).toBe(true)
		expect(budget.signal.reason instanceof DOMException).toBe(true)
		expect(budget.signal.reason.name).toBe('AbortError')
	})

	it('a parented budget re-armed after exhaustion stays born aborted while the parent is silent', () => {
		// Cross-cut: exhaust the budget, re-arm — the parent never aborted, so the only
		// source of the born-aborted re-arm is the budget's own consumed >= max guard, and
		// the reason is the default AbortError (the own controller), not a parent reason.
		const parent = new AbortController()
		const budget = new Budget<number>({ max: 50, consume: identity, signal: parent.signal })

		budget.consume(50)
		budget.start()

		expect(budget.signal.aborted).toBe(true)
		expect(parent.signal.aborted).toBe(false)
		expect(budget.signal.reason.name).toBe('AbortError')
	})

	it('a three-way bound (abort + timeout-substitute + budget) fires on whichever trips first', () => {
		// The agent-loop bound documented in the guide: fold an external cancel, a second
		// bound, and the budget signal into one AbortSignal.any — the budget exhausting
		// trips the combined signal while the other two stay intact.
		const cancel = new AbortController()
		const deadline = new AbortController()
		const budget = new Budget<number>({ max: 100, consume: identity })
		const bound = AbortSignal.any([cancel.signal, deadline.signal, budget.signal])
		const fired = createRecorder<readonly []>()
		bound.addEventListener('abort', fired.handler)

		budget.consume(100) // the budget wins the race

		expect(bound.aborted).toBe(true)
		expect(cancel.signal.aborted).toBe(false)
		expect(deadline.signal.aborted).toBe(false)
		expect(fired.count).toBe(1)
	})
})
