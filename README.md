# @orkestrel/budget

A typed spending budget — a cumulative consumption tally against a ceiling
that exposes an `AbortSignal` firing the moment the budget is **exhausted**.
Charge a `Budget<T>` as work spends — `consume(value)` adds to a running
`consumed` total — and race its `signal` against that work to cap how much it
may burn (tokens, bytes, calls). A convenience `createTokenBudget` factory
wraps the canonical LLM cost unit (`TokenUsage`) so callers don't have to
write their own extractor. Deliberately small: a pure, functional counter
with a signal bolted to its ceiling, no Emitter, no clock, no I/O of its own.
Part of the `@orkestrel` line.

## Install

```sh
npm install @orkestrel/budget
```

## Requirements

- Node.js >= 24
- ESM-only (no CommonJS build)

## Usage

```ts
import { createBudget, createTokenBudget } from '@orkestrel/budget'

const budget = createBudget<number>({ max: 10_000, consume: (cost) => cost })
budget.start()
budget.signal.addEventListener('abort', () => stop(), { once: true }) // fires when exhausted
budget.consume(4_000) // remaining 6_000
budget.consume(7_000) // crosses 10_000 — fires `signal`

// The token-budget convenience charges one TokenUsage field per provider call.
const tokens = createTokenBudget({ max: 50_000, scope: 'total' })
tokens.start()
tokens.consume({ prompt: 100, completion: 400, total: 500 })
```

`createBudget(options)` (or `new Budget(options)`) returns a
`BudgetInterface<T>`. `consume(value)` runs your extractor and adds the
validated finite nonnegative result to `consumed`; the moment cumulative `consumed` reaches `max`,
`exhausted` flips `true` and `signal` fires — exactly once. `start()`
re-arms a fresh per-request `signal` without resetting `consumed`, so the
ceiling stays one running total across many requests; `clear()` zeroes the
tally AND re-arms a fresh signal. Pass a parent `signal` to link an external
cancel — the exposed `signal` then fires on EITHER exhaustion OR the parent
aborting (via `AbortSignal.any`). Construction and token usage are strictly
validated with structured `ContractError`s. A thrown extractor, invalid charge,
or nonfinite cumulative overflow leaves the tally and signal unchanged.

## Guide

For the full surface — the `Budget` class, `BudgetInterface`, and the
`createTokenBudget` convenience — see
[`guides/src/budget.md`](guides/src/budget.md).

## Package

Published as a single typed entry point per the `exports` field in
`package.json`.

## License

MIT © [Orkestrel](https://github.com/orkestrel) — see [LICENSE](./LICENSE).
