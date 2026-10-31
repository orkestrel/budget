/**
 * Holds the registry-global key used to recognize {@link BudgetError} values across package copies.
 *
 * @remarks
 * The descriptor stores the branded value itself. Recognition compares that identity, so a
 * transparent proxy cannot forward its target's brand as its own. The registry makes the key
 * discoverable; it is a recognition mechanism, not an unforgeable provenance marker.
 */
export const BUDGET_ERROR_BRAND = Symbol.for('@orkestrel/budget.BudgetError')
