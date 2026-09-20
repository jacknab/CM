/**
 * One shared, frozen fallback for `const { data: rows = EMPTY_ARRAY } = useQuery(...)`.
 * An inline `= []` default is a brand-new array on every render while the query loads, so any
 * effect / memo keyed on it re-fires every render — with a setState inside, that loops until
 * React aborts with "Maximum update depth exceeded" (error #185).
 */
export const EMPTY_ARRAY = Object.freeze([]) as unknown as never[];
