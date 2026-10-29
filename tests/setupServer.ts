/** Holds the ESM filename used to drive both installed budget module formats. */
export const RECOGNITION_DRIVER = 'recognize.mjs'

/**
 * Holds the Node driver that reports budget error recognition through both module formats.
 *
 * @remarks The distinct constructors, own-copy answers, and lookalike refusals control the
 * cross-copy answers. The consumer supplies its installed package specifier as the first argument.
 */
export const RECOGNITION_DRIVER_SOURCE = `import { createRequire } from 'node:module'
import { cpSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const imported = await import(process.argv[2])
const required = createRequire(import.meta.url)(process.argv[2])
const manifest = createRequire(import.meta.url).resolve(process.argv[2] + '/package.json')
const duplicate = join(dirname(dirname(manifest)), 'budget-copy')
cpSync(dirname(manifest), duplicate, { recursive: true })
const copied = await import(pathToFileURL(join(duplicate, 'package.json')).href, { with: { type: 'json' } })
const second = await import(pathToFileURL(join(duplicate, copied.default.module)).href)
class SpecializedError extends imported.BudgetError {
	constructor() {
		super({ id: 'subclass', max: 1, consumed: 2 })
		this.name = 'SpecializedError'
	}
}
const exhaust = (entry, id) => {
	const budget = entry.createBudget({ id, max: 1, consumer: (charge) => charge })
	budget.consume(2)
	return budget.signal.reason
}
const fromImport = exhaust(imported, 'import')
const fromRequire = exhaust(required, 'require')
const fromCopy = exhaust(second, 'copy')
const subclass = new SpecializedError()
const plain = {}
Object.defineProperty(plain, imported.BUDGET_ERROR_BRAND, { value: plain })
const lookalike = Object.assign(new Error('budget reached its ceiling'), {
	code: 'exhaust',
	context: { id: 'lookalike', max: 1, consumed: 2 },
})
process.stdout.write(
	JSON.stringify({
		distinct: imported.BudgetError !== required.BudgetError,
		importOwn: imported.isBudgetError(fromImport),
		requireOwn: required.isBudgetError(fromRequire),
		importOnRequire: imported.isBudgetError(fromRequire),
		requireOnImport: required.isBudgetError(fromImport),
		importLookalike: imported.isBudgetError(lookalike),
		requireLookalike: required.isBudgetError(lookalike),
		copyDistinct: imported.BudgetError !== second.BudgetError,
		requireCopyDistinct: required.BudgetError !== second.BudgetError,
		importOnCopy: imported.isBudgetError(fromCopy),
		copyOnImport: second.isBudgetError(fromImport),
		subclass: [imported, required, second].every((entry) => entry.isBudgetError(subclass)),
		proxy: [imported, required, second].some((entry) => entry.isBudgetError(new Proxy(fromImport, {}))),
		plain: [imported, required, second].some((entry) => entry.isBudgetError(plain)),
		context: required.isBudgetError(fromImport) ? fromImport.context : undefined,
	}),
)
`
