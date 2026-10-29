import { isRecord } from '@orkestrel/contract'
import { createScratch } from '@orkestrel/test/server'
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RECOGNITION_DRIVER, RECOGNITION_DRIVER_SOURCE } from './setupServer.js'

describe('recognition driver fixture', () => {
	it('runs as the declared ESM filename and emits the distribution assertion protocol', () => {
		const scratch = createScratch({ prefix: 'budget-recognition-fixture-' })
		try {
			const driver = scratch.write(RECOGNITION_DRIVER, RECOGNITION_DRIVER_SOURCE)
			const source = new URL('../src/core/', import.meta.url)
			for (const name of readdirSync(source)) {
				if (!name.endsWith('.ts')) continue
				scratch.write(
					`node_modules/@orkestrel/budget/${name.replace(/\.ts$/u, '.js')}`,
					stripTypeScriptTypes(readFileSync(new URL(name, source), 'utf8')),
				)
			}
			scratch.write(
				'node_modules/@orkestrel/budget/package.json',
				JSON.stringify({
					type: 'module',
					module: './index.js',
					exports: { '.': './index.js', './package.json': './package.json' },
				}),
			)
			scratch.link(
				'node_modules/@orkestrel/contract',
				fileURLToPath(new URL('../node_modules/@orkestrel/contract/', import.meta.url)),
			)
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
				'copyDistinct',
				'copyOnImport',
				'distinct',
				'importLookalike',
				'importOnCopy',
				'importOnRequire',
				'importOwn',
				'plain',
				'proxy',
				'requireLookalike',
				'requireOnImport',
				'requireOwn',
				'subclass',
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
