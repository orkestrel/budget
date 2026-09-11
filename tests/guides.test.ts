// The consumer-side guides-parity drop-in: runs `@orkestrel/guide`'s checks against
// this repo's own `guides/README.md` manifest. The constants that follow are this
// package's own, as is the executed section that closes the file.

import { GuideCommand } from '@orkestrel/guide/server'
import { readInventory } from '@orkestrel/test/server'
import { createVitest } from 'vitest/node'

/** Every fence language this package's guides are allowed to use. */
const FENCE_LANGUAGES = Object.freeze(['ts'])
/** The fence language whose blocks count as worked examples. */
const EXAMPLE_LANGUAGE = 'ts'
/** The one guide this package sources, whose tagline the README pitch equals. */
const GUIDE_SPEC = 'guides/budget.md'
/** The package identity that binds its manifest, module map, and README pitch. */
const PACKAGE_NAME = '@orkestrel/budget'
/** Each import specifier this package's own guides may resolve against. */
const MODULES = Object.freeze({ [PACKAGE_NAME]: 'src/core', '@src/core': 'src/core' })
/**
 * Declarations deliberately kept out of the barrel, as `computeSymbolKey` strings.
 *
 * A class that one-class-per-file evicted from its single consumer cannot become a
 * local, so it stays exported without being public. Naming it here is what makes that
 * intentional rather than forgotten — and the assertion that follows it fails when a name
 * here stops being stranded, so the list cannot rot.
 */
const INTERNAL: readonly string[] = Object.freeze([])

await new GuideCommand({
	root: new URL('../', import.meta.url),
	patterns: ['src/**/*.ts', 'tests/**/*.ts', 'guides/*.md', '*.md', 'package.json'],
	modules: MODULES,
	languages: FENCE_LANGUAGES,
	language: EXAMPLE_LANGUAGE,
	reader: readInventory,
	runner: createVitest,
}).execute(async ({ files, report, rows }) => {
	const { isRecord, parseJSON } = await import('@orkestrel/contract')
	const { computeSymbolKey, findMissingSymbols } = await import('@orkestrel/guide')
	const { createRecorder, requireValue } = await import('@orkestrel/test')
	const { createBudget, createTokenBudget } = await import('@src/core')
	const { createTokenUsage } = await import('./setup.js')
	const { describe, expect, it } = await import('vitest')
	const manifest = parseJSON(requireValue(files['package.json'], 'Missing inventory: package.json'))
	if (!isRecord(manifest)) throw new Error('Invalid package manifest: package.json')

	it('manifest lists at least one guide', () => {
		expect(report.input).toEqual([])
		expect(rows.length).toBeGreaterThan(0)
		expect(rows.map((row) => row.entry.spec)).toContain(GUIDE_SPEC)
	})

	// The example half of the equality case is silent over an empty population: with no
	// title on both sides `findDrift` compares no pair and the case passes on the summaries
	// alone. This pins the population this repository's own guide contributes, so removing
	// every `@example` title reddens the suite instead of quietly retiring half the gate.
	// The failure names both title sets, because a pin reporting only its own emptiness
	// leaves the reader to work out which side dropped the title.
	it('pairs at least one example title across the guide and the source', () => {
		expect(report.examples.titles.filter((finding) => finding.spec === GUIDE_SPEC)).toEqual([])
	})

	// The README's pitch and the guide's tagline are one text, each read as the blockquote
	// under its file's H1. `README.md` is outside the concept index, so the reader is
	// applied to it directly rather than through a manifest row. Each side is guarded
	// against `undefined` first, so a file that lost its blockquote reports that rather
	// than reporting two absences as agreement.
	it('opens the README with the guide tagline', () => {
		expect(manifest.name).toBe(PACKAGE_NAME)
		expect(report.pitch).toEqual([])
	})

	for (const { entry, guide, source } of rows) {
		describe(`${entry.concept}`, () => {
			it('uses only listed fence languages', () => {
				expect(report.fences.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})

			it('extracts a non-empty documented surface', () => {
				expect(guide.surface().length).toBeGreaterThan(0)
			})
			it('re-exports every direct declaration that is not named internal', () => {
				const stranded = findMissingSymbols(source.exports(), source.surface())
				expect(stranded.filter((key) => !INTERNAL.includes(key))).toEqual([])
			})
			it('names no symbol internal that the barrel already exports', () => {
				const stranded = findMissingSymbols(source.exports(), source.surface())
				expect(INTERNAL.filter((key) => !stranded.includes(key))).toEqual([])
			})
			it('re-exports only direct declarations', () => {
				expect(findMissingSymbols(source.surface(), source.exports())).toEqual([])
			})
			it('documents every barrel export', () => {
				expect(findMissingSymbols(source.surface(), guide.surface())).toEqual([])
			})
			it('documents only barrel exports', () => {
				expect(findMissingSymbols(guide.surface(), source.surface())).toEqual([])
			})

			it('exposes no hidden module-scope declarations', () => {
				expect(source.hidden().map(computeSymbolKey)).toEqual([])
			})

			it('keeps behavioral interfaces and implementing classes in parity', () => {
				expect(report.methods.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})

			// The equality gate: a `Summary` cell against its export's description paragraph, a
			// titled fence against the `@example` of that title. The shared report owns the
			// comparison and names both sides; converge the two sides through the native entry,
			// never by weakening this assertion. It pairs an example only where a title is present
			// on both sides, so an untitled `@example` block is outside this case. Select source
			// authority with `--to guide`, or guide authority with `--to source`.
			it('keeps every compared summary and example equal to its source', () => {
				expect(report.drift.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})

			it('documents an example for every Surface function', () => {
				expect(report.examples.functions.filter((finding) => finding.spec === entry.spec)).toEqual(
					[],
				)
			})

			it('documents an example for every method', () => {
				expect(report.examples.methods.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})

			it('imports only real exports in every ```ts fence', () => {
				expect(report.imports.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})

			it('resolves every relative link', () => {
				expect(report.links.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})
			it('links only to test files that exist', () => {
				expect(report.tests.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})
		})
	}

	// The EXECUTED half. Every preceding check reads a name — from source text or from a
	// prototype — and a name that resolves proves nothing about a sentence beside it, so a
	// fence whose comment claims a value the code contradicts passes all of them. The cases
	// here run the flagship fences of `guides/budget.md` and assert the values their comments
	// claim. Change a fence, change the transcription beside it.
	describe('flagship fences', () => {
		const guideText = requireValue(files[GUIDE_SPEC], `Missing file: ${GUIDE_SPEC}`)

		it('charges the Surface fence and fires the signal exactly once at the ceiling', () => {
			// Transcribed from the Surface fence. The listener stands in for the fence's
			// `stop()` so the "fires when exhausted" comment is a counted call, not a name.
			const budget = createBudget<number>({ max: 10_000, consumer: (cost) => cost })
			const fired = createRecorder<readonly []>()
			budget.start()
			budget.signal.addEventListener('abort', fired.handler)

			budget.consume(4_000)
			expect(budget.remaining).toBe(6_000)
			expect(fired.count).toBe(0)

			budget.consume(7_000)
			expect(budget.signal.aborted).toBe(true)
			expect(fired.count).toBe(1)
		})

		it('carries the Surface fence lines the transcription copies', () => {
			// The presence guard beside the transcription: it proves the transcribed lines are
			// still the documented ones, and nothing whatever about behavior.
			expect(guideText).toContain(
				'const budget = createBudget<number>({ max: 10_000, consumer: (cost) => cost })',
			)
			expect(guideText).toContain('budget.consume(4_000) // remaining 6_000')
			expect(guideText).toContain('budget.consume(7_000) // crosses 10_000 — fires `signal`')
		})

		it('stops the stream loop after the cumulative bytes cross the ceiling', () => {
			// Transcribed from the race-work-against-the-ceiling fence, driven over a local
			// list of byte lengths in place of the fence's stream. Each chunk is 400_000 bytes; the
			// tally crosses 1_000_000 at 1_200_000, and the bound refuses the chunk that would follow.
			const budget = createBudget<number>({ max: 1_000_000, consumer: (bytes) => bytes })
			const fired = createRecorder<readonly []>()
			budget.start()
			budget.signal.addEventListener('abort', fired.handler, { once: true })
			const chunks: readonly number[] = [400_000, 400_000, 400_000, 400_000]
			const processed: number[] = []

			for (const byteLength of chunks) {
				if (budget.signal.aborted) break
				budget.consume(byteLength)
				processed.push(byteLength)
			}

			expect(processed).toEqual([400_000, 400_000, 400_000])
			expect(budget.consumed).toBe(1_200_000)
			expect(fired.count).toBe(1)
		})

		it('carries the stream fence lines the transcription copies', () => {
			expect(guideText).toContain(
				'const budget = createBudget<number>({ max: 1_000_000, consumer: (bytes) => bytes })',
			)
			expect(guideText).toContain(
				'if (budget.signal.aborted) break // the ceiling was crossed mid-stream',
			)
			expect(guideText).toContain('budget.consume(chunk.byteLength)')
		})

		it('trips the agent loop bound on the token budget alone', () => {
			// Transcribed from the agent-loop fence. The deadline is a short host timer that is
			// never awaited, so the case carries no minute-long timer and every read here is
			// synchronous: only the budget can have tripped the bound by the last assertion.
			const cancel = new AbortController()
			const deadline = AbortSignal.timeout(50)
			const budget = createTokenBudget({ max: 50_000, scope: 'total' })
			budget.start()
			const bound = AbortSignal.any([cancel.signal, deadline, budget.signal])
			const responses = [
				createTokenUsage(10_000, 10_000, 20_000),
				createTokenUsage(10_000, 10_000, 20_000),
				createTokenUsage(10_000, 10_000, 20_000),
				createTokenUsage(10_000, 10_000, 20_000),
			]
			const charged: number[] = []

			for (const usage of responses) {
				if (bound.aborted) break
				budget.consume(usage)
				charged.push(usage.total)
			}

			expect(charged).toEqual([20_000, 20_000, 20_000])
			expect(bound.aborted).toBe(true)
			expect(budget.signal.aborted).toBe(true)
			expect(cancel.signal.aborted).toBe(false)
			expect(deadline.aborted).toBe(false)
		})

		it('carries the agent loop fence lines the transcription copies', () => {
			expect(guideText).toContain(
				"const budget = createTokenBudget({ max: 50_000, scope: 'total' }) // cost ceiling",
			)
			expect(guideText).toContain(
				'const bound = AbortSignal.any([cancel.signal, deadline, budget.signal])',
			)
			expect(guideText).toContain(
				'budget.consume(usage) // fires budget.signal after the ceiling is crossed',
			)
		})

		it('reopens a spent budget from zero with clear', () => {
			// Transcribed from the reuse-a-handle fence: each comment on the fence is an
			// assertion here.
			const budget = createBudget<number>({ max: 1_000, consumer: (n) => n })
			budget.start()

			budget.consume(1_000)
			expect(budget.exhausted).toBe(true)
			expect(budget.signal.aborted).toBe(true)

			budget.clear()
			expect(budget.consumed).toBe(0)
			expect(budget.remaining).toBe(1_000)
			expect(budget.signal.aborted).toBe(false)

			budget.consume(200)
			expect(budget.consumed).toBe(200)
		})

		it('carries the clear fence lines the transcription copies', () => {
			expect(guideText).toContain(
				'budget.consume(1_000) // crosses the ceiling — signal fires, exhausted is true',
			)
			expect(guideText).toContain(
				'budget.clear() // consumed resets to 0, remaining is max again, signal is fresh',
			)
			expect(guideText).toContain('budget.consume(200) // spends against the new window')
		})
	})
})
