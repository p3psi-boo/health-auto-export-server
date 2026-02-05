export function filterFields<T extends Record<string, unknown>>(
  obj: T,
  include?: string,
  exclude?: string
): Partial<T> {
  if (include) {
    const keys = include.split(",").map((k) => k.trim()).filter(Boolean);
    const result: Partial<T> = {};
    for (const key of keys) {
      if (key in obj) {
        result[key as keyof T] = obj[key as keyof T];
      }
    }
    return result;
  }

  if (exclude) {
    const keys = new Set(exclude.split(",").map((k) => k.trim()).filter(Boolean));
    const result: Partial<T> = {};
    for (const key of Object.keys(obj)) {
      if (!keys.has(key)) {
        result[key as keyof T] = obj[key as keyof T];
      }
    }
    return result;
  }

  return obj;
}
