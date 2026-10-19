/** Holds the ESM filename used to drive both installed budget module formats. */
export const RECOGNITION_DRIVER = 'recognize.mjs'

/**
 * Holds the Node driver that reports budget error recognition through both module formats.
 *
 * @remarks The distinct constructors, own-copy answers, and lookalike refusals control the
 * cross-copy answers. The consumer supplies its installed package specifier as the first argument.
 */
export const RECOGNITION_DRIVER_SOURCE = `import { createRequire } from 'node:module'
const imported = await import(process.argv[2])
const required = createRequire(import.meta.url)(process.argv[2])
const exhaust = (entry, id) => {
	const budget = entry.createBudget({ id, max: 1, consumer: (charge) => charge })
	budget.consume(2)
	return budget.signal.reason
}
const fromImport = exhaust(imported, 'import')
const fromRequire = exhaust(required, 'require')
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
		context: required.isBudgetError(fromImport) ? fromImport.context : undefined,
	}),
)
`
