// The consumer-side guides-parity drop-in: runs `@orkestrel/guide`'s checks against
// this repo's own `guides/README.md` manifest. The constants that follow are this
// package's own, as is the executed section that closes the file.

import { describe, expect, it } from 'vitest'
import {
	computeSymbolKey,
	createGuide,
	createSource,
	createSourceManager,
	extractFenceImports,
	findDrift,
	findMissing,
	findMissingSymbols,
	findUnexampled,
	findUnlisted,
	isExternalLink,
	parseManifest,
	resolveLink,
} from '@orkestrel/guide'
import { readFileSync } from 'node:fs'
import { createRecorder, requireValue } from '@orkestrel/test'
import { readInventory } from '@orkestrel/test/server'
import { createBudget, createTokenBudget } from '@src/core'
import { createTokenUsage } from './setup.js'

/** Every fence language this package's guides are allowed to use. */
const FENCE_LANGUAGES = Object.freeze(['ts'])
/** The fence language whose blocks count as worked examples. */
const EXAMPLE_LANGUAGE = 'ts'
/** The one guide this package sources, whose tagline the README pitch equals. */
const GUIDE_SPEC = 'guides/budget.md'
/** Each import specifier this package's own guides may resolve against. */
const MODULES = Object.freeze({ '@orkestrel/budget': 'src/core', '@src/core': 'src/core' })
/**
 * Declarations deliberately kept out of the barrel, as `computeSymbolKey` strings.
 *
 * A class that one-class-per-file evicted from its single consumer cannot become a
 * local, so it stays exported without being public. Naming it here is what makes that
 * intentional rather than forgotten — and the assertion that follows it fails when a name
 * here stops being stranded, so the list cannot rot.
 */
const INTERNAL: readonly string[] = Object.freeze([])

/** Root-level files these checks read. `readInventory` walks directories only. */
const ROOT_FILES = Object.freeze(['AGENTS.md', 'README.md'])

const root = new URL('../', import.meta.url)
const files: Record<string, string> = {
	...readInventory(root, ['src', 'guides', 'tests'], { extensions: ['.ts', '.md'] }),
}
for (const name of ROOT_FILES) files[name] = readFileSync(new URL(name, root), 'utf8')
const manifest = parseManifest(
	requireValue(files['guides/README.md'], 'Missing file: guides/README.md'),
	'guides',
)
const sources = createSourceManager({ files, modules: MODULES })
const own = requireValue(
	manifest.find((entry) => entry.spec === GUIDE_SPEC),
	`Missing manifest row: ${GUIDE_SPEC}`,
)

it('manifest lists at least one guide', () => {
	expect(manifest.length).toBeGreaterThan(0)
})

// The example half of the equality case is silent over an empty population: with no
// title on both sides `findDrift` compares no pair and the case passes on the summaries
// alone. This pins the population this repository's own guide contributes, so removing
// every `@example` title reddens the suite instead of quietly retiring half the gate.
// The failure names both title sets, because a pin reporting only its own emptiness
// leaves the reader to work out which side dropped the title.
it('pairs at least one example title across the guide and the source', () => {
	const guide = createGuide(requireValue(files[GUIDE_SPEC], `Missing file: ${GUIDE_SPEC}`))
	const source = createSource({ files, module: own.source })
	const declared = source
		.examples()
		.map((example) => example.title)
		.filter((title) => title !== undefined)
	const titled = new Set(declared)
	const headings: string[] = []
	const paired: string[] = []
	for (const fence of guide.fences()) {
		if (fence.title === undefined) continue
		headings.push(fence.title)
		if (titled.has(fence.title)) paired.push(fence.title)
	}
	const unpaired =
		paired.length > 0
			? []
			: [
					`${GUIDE_SPEC} pairs: guide ${JSON.stringify(headings)} source ${JSON.stringify(declared)}`,
				]
	expect(unpaired).toEqual([])
})

// The README's pitch and the guide's tagline are one text, each read as the blockquote
// under its file's H1. `README.md` is outside the concept index, so the reader is
// applied to it directly rather than through a manifest row. Each side is guarded
// against `undefined` first, so a file that lost its blockquote reports that rather
// than reporting two absences as agreement.
it('opens the README with the guide tagline', () => {
	const pitch = createGuide(requireValue(files['README.md'], 'Missing file: README.md')).tagline()
	const tagline = createGuide(
		requireValue(files[GUIDE_SPEC], `Missing file: ${GUIDE_SPEC}`),
	).tagline()

	expect(pitch).not.toBeUndefined()
	expect(tagline).not.toBeUndefined()
	expect(pitch).toBe(tagline)
})

for (const entry of manifest) {
	const guide = createGuide(requireValue(files[entry.spec], `Missing file: ${entry.spec}`))
	const source = createSource({ files, module: entry.source })

	describe(`${entry.concept}`, () => {
		it('uses only listed fence languages', () => {
			expect(findUnlisted(guide.fences(), FENCE_LANGUAGES)).toEqual([])
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

		for (const group of guide.methods()) {
			const members = source.methods(group.interface).map((method) => method.name)
			const documented = group.methods.map((method) => method.name)
			const entity = group.interface.replace(/Interface$/, '')
			describe(`${group.interface}`, () => {
				it('documents at least one method', () => {
					expect(group.methods.length).toBeGreaterThan(0)
				})
				it('documents every interface method', () => {
					expect(findMissing(members, documented)).toEqual([])
				})
				it('documents no phantom method', () => {
					expect(findMissing(documented, members)).toEqual([])
				})
				it(`${entity} exposes no undocumented method`, () => {
					const extra =
						entity === group.interface
							? []
							: findMissing(
									source.methods(entity).map((method) => method.name),
									documented,
								)
					expect(extra).toEqual([])
				})
			})
		}

		// The equality gate: a `Summary` cell against its export's description paragraph, a
		// titled fence against the `@example` of that title. `findDrift` owns the comparison
		// and names both sides; converge the two sides with `npm run docs`, never by
		// weakening this assertion. `findDrift` pairs an example only where a title is
		// present on both sides, so an untitled `@example` block is outside this case. Each
		// collected line is the spec, the key, and each side's text or `absent` — the same
		// worklist `npm run docs` prints, so a failure here is read the way that command's
		// output is.
		it('keeps every compared summary and example equal to its source', () => {
			const disagreeing: string[] = []
			for (const drift of findDrift(guide, source)) {
				const left = drift.guide === undefined ? 'absent' : JSON.stringify(drift.guide)
				const right = drift.source === undefined ? 'absent' : JSON.stringify(drift.source)
				disagreeing.push(`${entry.spec} ${drift.key}: guide ${left} source ${right}`)
			}
			expect(disagreeing).toEqual([])
		})

		it('documents an example for every Surface function', () => {
			const fences = guide
				.fences()
				.filter((fence) => fence.language === EXAMPLE_LANGUAGE)
				.map((fence) => fence.code)
			const names = guide
				.surface()
				.filter((symbol) => symbol.keyword === 'function')
				.map((symbol) => symbol.name)
			expect(
				findUnexampled(
					names,
					fences,
					source.examples().map((example) => example.name),
				),
			).toEqual([])
		})

		for (const group of guide.methods()) {
			const entity = group.interface.replace(/Interface$/, '')
			const documented = group.methods.map((method) => method.name)
			const examples =
				entity === group.interface
					? source.examples(group.interface).map((example) => example.name)
					: source
							.examples(group.interface)
							.map((example) => example.name)
							.concat(source.examples(entity).map((example) => example.name))
			describe(`${group.interface} examples`, () => {
				it('documents an example for every method', () => {
					const fences = guide
						.fences()
						.filter((fence) => fence.language === EXAMPLE_LANGUAGE)
						.map((fence) => fence.code)
					expect(findUnexampled(documented, fences, examples)).toEqual([])
				})
			})
		}

		it('imports only real exports in every ```ts fence', () => {
			const fences = guide.fences().filter((fence) => fence.language === EXAMPLE_LANGUAGE)
			for (const fence of fences) {
				for (const { specifier, names } of extractFenceImports(fence.code)) {
					const imported = sources.source(specifier)
					if (imported === undefined) continue
					const surface = imported.surface().map((symbol) => symbol.name)
					expect(findMissing(names, surface)).toEqual([])
				}
			}
		})

		it('resolves every relative link', () => {
			const broken = guide
				.links()
				.filter((href) => !isExternalLink(href))
				.map((href) => resolveLink(entry.spec, href))
				.filter((path) => !source.exists(path))
			expect(broken).toEqual([])
		})
		it('links only to test files that exist', () => {
			const missing = guide
				.tests()
				.map((href) => resolveLink(entry.spec, href))
				.filter((path) => !source.exists(path))
			expect(missing).toEqual([])
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
