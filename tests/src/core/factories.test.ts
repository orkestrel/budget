import type { TokenUsage } from '@src/core'
import { createBudget, createTokenBudget } from '@src/core'
import { describe, expect, it } from 'vitest'
import { createRecorder } from '../../setup.js'

// The budget factories — createBudget returns a working BudgetInterface, and
// createTokenBudget charges the chosen TokenUsage scope. Full tally / re-arm /
// parent behavior lives in Budget.test.ts; here we assert the factories hand back
// usable handles and that the token convenience picks the right field.

const identity = (value: number): number => value

const usage = (prompt: number, completion: number, total: number): TokenUsage => ({
	prompt,
	completion,
	total,
})

describe('createBudget', () => {
	it('returns a working BudgetInterface (consume → exhaust + signal)', () => {
		const budget = createBudget<number>({ max: 100, consume: identity })
		const fired = createRecorder<readonly []>()
		budget.signal.addEventListener('abort', fired.handler)

		expect(budget.max).toBe(100)
		expect(budget.exhausted).toBe(false)

		budget.consume(60)
		expect(budget.consumed).toBe(60)
		expect(budget.remaining).toBe(40)
		expect(budget.signal.aborted).toBe(false)

		budget.consume(40)
		expect(budget.exhausted).toBe(true)
		expect(budget.signal.aborted).toBe(true)
		expect(fired.count).toBe(1)
	})

	it('honors the id option', () => {
		const budget = createBudget<number>({ id: 'budget-7', max: 10, consume: identity })

		expect(budget.id).toBe('budget-7')
	})

	it('honors a parent signal — a parent abort fires the budget signal', () => {
		const parent = new AbortController()
		const budget = createBudget<number>({ max: 100, consume: identity, signal: parent.signal })

		parent.abort()

		expect(budget.signal.aborted).toBe(true)
		expect(budget.exhausted).toBe(false)
	})
})

describe('createTokenBudget', () => {
	it('charges the completion field by default', () => {
		const budget = createTokenBudget({ max: 30 })

		budget.consume(usage(100, 15, 115))
		expect(budget.consumed).toBe(15)
		budget.consume(usage(100, 15, 115))
		// 15 + 15 = 30 — the completion scope crossed the ceiling.
		expect(budget.consumed).toBe(30)
		expect(budget.exhausted).toBe(true)
		expect(budget.signal.aborted).toBe(true)
	})

	it("charges the total field when scope is 'total'", () => {
		const budget = createTokenBudget({ max: 200, scope: 'total' })

		budget.consume(usage(100, 15, 115))
		expect(budget.consumed).toBe(115)
		budget.consume(usage(50, 40, 90))
		// 115 + 90 = 205 >= 200 — the total scope trips it.
		expect(budget.consumed).toBe(205)
		expect(budget.signal.aborted).toBe(true)
	})

	it("charges the prompt field when scope is 'prompt'", () => {
		const budget = createTokenBudget({ max: 120, scope: 'prompt' })

		budget.consume(usage(100, 15, 115))
		expect(budget.consumed).toBe(100)
		expect(budget.signal.aborted).toBe(false)
		budget.consume(usage(20, 5, 25))
		// 100 + 20 = 120 — the prompt scope reaches the ceiling exactly.
		expect(budget.consumed).toBe(120)
		expect(budget.signal.aborted).toBe(true)
	})

	it('honors id and a parent signal', () => {
		const parent = new AbortController()
		const budget = createTokenBudget({ id: 'tokens-3', max: 1_000, signal: parent.signal })

		expect(budget.id).toBe('tokens-3')

		parent.abort()
		expect(budget.signal.aborted).toBe(true)
	})

	it('a default id is assigned when none is supplied', () => {
		const budget = createTokenBudget({ max: 1_000 })

		// The createBudget UUID default flows through the token convenience.
		expect(typeof budget.id).toBe('string')
		expect(budget.id.length).toBeGreaterThan(0)
	})

	it('the chosen scope reads exactly its own field, ignoring the other usage fields', () => {
		// A completion-scoped budget must NOT be advanced by prompt/total — only the
		// completion field charges the tally even when the other fields are large.
		const budget = createTokenBudget({ max: 10, scope: 'completion' })

		budget.consume(usage(1_000, 4, 1_004))
		expect(budget.consumed).toBe(4) // prompt 1_000 / total 1_004 ignored
		expect(budget.signal.aborted).toBe(false)
		budget.consume(usage(1_000, 6, 1_006))
		expect(budget.consumed).toBe(10) // 4 + 6 reaches the ceiling
		expect(budget.signal.aborted).toBe(true)
	})

	it('a zero in the scoped field is a no-op charge', () => {
		// A provider response with zero completion tokens must not advance a completion
		// budget — the tally only moves by the field's value.
		const budget = createTokenBudget({ max: 100, scope: 'completion' })

		budget.consume(usage(50, 0, 50))
		expect(budget.consumed).toBe(0)
		expect(budget.exhausted).toBe(false)
		expect(budget.signal.aborted).toBe(false)
	})

	it('re-arms a fresh per-request signal without resetting the cumulative token spend', () => {
		// The session pattern through the convenience: spend, re-arm, spend again — the
		// cumulative total carries forward and trips a per-request signal at the ceiling.
		const budget = createTokenBudget({ max: 100, scope: 'total' })

		budget.consume(usage(20, 20, 40))
		budget.start()
		expect(budget.consumed).toBe(40)
		expect(budget.signal.aborted).toBe(false)

		budget.consume(usage(30, 30, 60)) // 40 + 60 = 100 crosses the lifetime ceiling
		expect(budget.consumed).toBe(100)
		expect(budget.exhausted).toBe(true)
		expect(budget.signal.aborted).toBe(true)
	})

	it('createTokenBudget at max: 0 is born exhausted and trips on the first consume', () => {
		const budget = createTokenBudget({ max: 0 })
		const fired = createRecorder<readonly []>()
		budget.signal.addEventListener('abort', fired.handler)

		expect(budget.exhausted).toBe(true)

		budget.consume(usage(0, 0, 0))
		expect(budget.signal.aborted).toBe(true)
		expect(fired.count).toBe(1)
	})

	it('createBudget passes the consume extractor through unchanged', () => {
		// Proves the factory does not wrap or transform the consumer — a record extractor
		// drives the tally exactly as written.
		const budget = createBudget<{ readonly weight: number }>({
			max: 10,
			consume: (value) => value.weight,
		})

		budget.consume({ weight: 4 })
		budget.consume({ weight: 4 })
		expect(budget.consumed).toBe(8)
		expect(budget.signal.aborted).toBe(false)
		budget.consume({ weight: 2 })
		expect(budget.signal.aborted).toBe(true)
	})

	it('createBudget hands back a re-armable handle (start() is wired through)', () => {
		// A factory-built handle is a full Budget: start() re-arms a fresh signal without
		// resetting the tally, just like the class.
		const budget = createBudget<number>({ max: 100, consume: identity })

		budget.consume(40)
		const first = budget.signal
		budget.start()

		expect(budget.signal).not.toBe(first)
		expect(budget.signal.aborted).toBe(false)
		expect(budget.consumed).toBe(40)
	})
})
