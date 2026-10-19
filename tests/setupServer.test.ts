import { isRecord } from '@orkestrel/contract'
import { createScratch } from '@orkestrel/test/server'
import { spawnSync } from 'node:child_process'
import { basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RECOGNITION_DRIVER, RECOGNITION_DRIVER_SOURCE } from './setupServer.js'

describe('recognition driver fixture', () => {
	it('runs as the declared ESM filename and emits the distribution assertion protocol', () => {
		const scratch = createScratch({ prefix: 'budget-recognition-fixture-' })
		try {
			const driver = scratch.write(RECOGNITION_DRIVER, RECOGNITION_DRIVER_SOURCE)
			scratch.link('node_modules/@orkestrel/budget', fileURLToPath(new URL('../', import.meta.url)))
			const result = spawnSync(process.execPath, [driver, '@orkestrel/budget'], {
				cwd: scratch.path,
				encoding: 'utf8',
				timeout: 5_000,
			})
			if (result.status !== 0) {
				throw new Error(`The recognition fixture failed: ${result.stderr}`, { cause: result.error })
			}
			const report: unknown = JSON.parse(result.stdout)
			if (!isRecord(report)) throw new Error('Expected the recognition report')

			expect(basename(driver)).toBe('recognize.mjs')
			expect(extname(driver)).toBe('.mjs')
			expect(result.stderr).toBe('')
			expect(Object.keys(report).sort()).toStrictEqual([
				'context',
				'distinct',
				'importLookalike',
				'importOnRequire',
				'importOwn',
				'requireLookalike',
				'requireOnImport',
				'requireOwn',
			])
			for (const [key, value] of Object.entries(report)) {
				if (key === 'context') continue
				expect(typeof value).toBe('boolean')
			}
			expect(report.context).toStrictEqual({ id: 'import', max: 1, consumed: 2 })
		} finally {
			scratch.destroy()
		}
	})
})
