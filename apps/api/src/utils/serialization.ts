/**
 * Converts snake_case object keys (as returned by the SQLite repository
 * layer) to camelCase for API responses, recursively, so the HTTP contract
 * stays consistent regardless of the underlying storage column naming.
 * Applied once, at the response boundary, in each controller -- repository
 * and service code keeps using the DB's native snake_case internally.
 */
export function camelizeKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => camelizeKeys(item)) as unknown as T;
  }

  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const camelKey = key.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
      result[camelKey] = camelizeKeys(val);
    }
    return result as unknown as T;
  }

  return value;
}
