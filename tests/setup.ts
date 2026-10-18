import type { ContractError } from '@orkestrel/contract'
import type { RecorderInterface } from '@orkestrel/test'
import type { BudgetError, BudgetInterface, TokenUsage } from '@src/core'
import { isContractError } from '@orkestrel/contract'
import { captureError, createRecorder } from '@orkestrel/test'
import { createBudget, isBudgetError } from '@src/core'

/**
 * Captures and narrows a contract error thrown by an operation.
 *
 * @param operation - Operation expected to throw a contract error
 * @returns The narrowed contract error
 * @throws {Error} When the operation does not throw a contract error
 *
 * @example
 * ```ts
 * const error = captureContractError(() => createBudget({ max: -1, consumer: Number }))
 * ```
 */
export function captureContractError(operation: () => unknown): ContractError {
	const error = captureError(operation)
	if (!isContractError(error)) throw new Error('Expected a ContractError')
	return error
}

/**
 * Selects a numeric value itself as a budget charge.
 *
 * @param value - Numeric value to select
 * @returns The unchanged value
 *
 * @example
 * ```ts
 * selectCharge(5) // 5
 * ```
 */
export function selectCharge(value: number): number {
	return value
}

/**
 * Creates a token usage record from its three counts.
 *
 * @param prompt - Prompt token count
 * @param completion - Completion token count
 * @param total - Total token count
 * @returns The token usage record
 *
 * @example
 * ```ts
 * createTokenUsage(100, 15, 115) // { prompt: 100, completion: 15, total: 115 }
 * ```
 */
export function createTokenUsage(prompt: number, completion: number, total: number): TokenUsage {
	return { prompt, completion, total }
}

/**
 * Holds a proxy that records every property read off its target, in read order.
 *
 * @remarks
 * The read log is a `#` field of this entity, which the proxy's trap appends to for as long as the
 * proxy is reachable. `reads` returns that log itself, never a snapshot, so a consumer that
 * destructures it before the code under test reads the target still sees every later read.
 *
 * @example
 * ```ts
 * const { proxy, reads } = new ReadingProxy({ max: 10 })
 * proxy.max // reads is ['max']
 * ```
 */
export class ReadingProxy<T extends object> {
	readonly #reads: PropertyKey[] = []

	/** Holds the proxy to hand to the code under test. */
	readonly proxy: T

	/**
	 * Creates a reading proxy over a target.
	 *
	 * @param target - Object whose property reads are recorded
	 */
	constructor(target: T) {
		this.proxy = new Proxy(target, {
			get: (subject, property, receiver) => {
				this.#reads.push(property)
				return Reflect.get(subject, property, receiver)
			},
		})
	}

	/** Lists every property read through the proxy, oldest first. */
	get reads(): readonly PropertyKey[] {
		return this.#reads
	}
}

/**
 * Counts the calls made through it and numbers each one, so a fixture that branches on which
 * call it is reads the number it was handed.
 *
 * @remarks
 * The count is a `#` field of this entity. It lives here rather than in a recorder because a
 * recorder whose only read is its count records nothing a test reads.
 *
 * @example
 * ```ts
 * const calls = new CallCounter()
 * calls.next() // 1
 * calls.next() // 2
 * calls.count // 2
 * ```
 */
export class CallCounter {
	#count = 0

	/** Holds how many calls have been numbered. */
	get count(): number {
		return this.#count
	}

	/** Numbers the next call, starting at one, and returns that number. */
	next(): number {
		this.#count += 1
		return this.#count
	}
}

/**
 * Defines, in place on the target it receives, a property whose every read throws.
 *
 * @remarks
 * The installed descriptor is the native `AbortSignal.prototype.aborted` getter, which
 * throws a real `TypeError` when read through a receiver that is not an `AbortSignal`.
 *
 * @param target - Object that receives the throwing property; the call mutates it
 * @param key - Property name that throws on read
 * @returns The same target object, mutated in place with the throwing property installed
 * @throws {Error} When the native `aborted` descriptor is absent
 *
 * @example
 * ```ts
 * const options = defineThrowingProperty({ consumer: selectCharge }, 'max')
 * ```
 */
export function defineThrowingProperty<T extends object>(target: T, key: string): T {
	const descriptor = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')
	if (descriptor === undefined) throw new Error('Expected the native aborted descriptor')
	Object.defineProperty(target, key, descriptor)
	return target
}

/**
 * Selects the length of a text as its cost estimate.
 *
 * @param text - Text whose length is the estimate
 * @returns The text length
 *
 * @example
 * ```ts
 * selectLength('hello') // 5
 * ```
 */
export function selectLength(text: string): number {
	return text.length
}

/**
 * Selects a quarter of a text's length, rounded up, as its token estimate.
 *
 * @param text - Text whose quarter length is the estimate
 * @returns The rounded-up quarter length
 *
 * @example
 * ```ts
 * selectQuarterLength('Once upon') // 3
 * ```
 */
export function selectQuarterLength(text: string): number {
	return Math.ceil(text.length / 4)
}

/**
 * Creates a real budget whose consumer records each consumed value before it selects the charge.
 *
 * @remarks
 * The recorder sees the value even when `select` throws, so a refused charge is still observable.
 *
 * @param max - The finite nonnegative ceiling of the budget
 * @param select - Maps a consumed value to its charge, and may throw to refuse it
 * @returns The budget and the recorder holding each consumed value in order
 *
 * @example
 * ```ts
 * const { budget, charges } = createRecordingBudget<number>(10, selectCharge)
 * budget.consume(4) // charges.calls is [[4]]
 * ```
 */
export function createRecordingBudget<T>(
	max: number,
	select: (value: T) => number,
): { readonly budget: BudgetInterface<T>; readonly charges: RecorderInterface<readonly [T]> } {
	const charges = createRecorder<readonly [T]>()
	const budget = createBudget<T>({
		max,
		consumer: (value) => {
			charges.handler(value)
			return select(value)
		},
	})
	return { budget, charges }
}

/**
 * Creates a plain object that implements every `BudgetInterface` member, with chosen members replaced.
 *
 * @param overrides - Members that replace the valid ones, such as a mistyped `max`
 * @returns A budget candidate the `isBudget` guard accepts until an override breaks it
 *
 * @example
 * ```ts
 * createBudgetCandidate({ max: -1 }) // a candidate with a negative ceiling
 * ```
 */
export function createBudgetCandidate(
	overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
	return {
		id: 'candidate',
		signal: new AbortController().signal,
		max: 10,
		consumed: 0,
		remaining: 10,
		exhausted: false,
		start: () => undefined,
		consume: () => undefined,
		clear: () => undefined,
		...overrides,
	}
}

/**
 * Narrows an abort reason to the budget exhaustion error it must be.
 *
 * @param value - The reason read off a budget signal
 * @returns The value narrowed to a `BudgetError`
 * @throws {Error} When the value is not a `BudgetError`
 *
 * @example
 * ```ts
 * requireBudgetError(budget.signal.reason).context // { id, max, consumed }
 * ```
 */
export function requireBudgetError(value: unknown): BudgetError {
	if (!isBudgetError(value)) throw new Error('Expected a BudgetError')
	return value
}
