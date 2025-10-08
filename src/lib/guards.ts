/**
 * Type guards and validation utilities to prevent undefined/null crashes
 */

/**
 * Ensure value is an object, throw descriptive error if not
 */
export function ensureObject<T extends object>(v: unknown, name: string): T {
  if (v == null || typeof v !== "object") {
    throw new Error(
      `Expected object for ${name}, got ${v == null ? "null/undefined" : typeof v}`,
    );
  }
  return v as T;
}

/**
 * Ensure value is an array, throw descriptive error if not
 */
export function ensureArray<T>(v: unknown, name: string): T[] {
  if (!Array.isArray(v)) {
    throw new Error(
      `Expected array for ${name}, got ${v == null ? "null/undefined" : typeof v}`,
    );
  }
  return v as T[];
}

/**
 * Ensure value is a string, throw descriptive error if not
 */
export function ensureString(v: unknown, name: string): string {
  if (typeof v !== "string") {
    throw new Error(
      `Expected string for ${name}, got ${v == null ? "null/undefined" : typeof v}`,
    );
  }
  return v;
}

/**
 * Ensure value is a number, throw descriptive error if not
 */
export function ensureNumber(v: unknown, name: string): number {
  if (typeof v !== "number" || isNaN(v)) {
    throw new Error(
      `Expected number for ${name}, got ${v == null ? "null/undefined" : typeof v}`,
    );
  }
  return v;
}

/**
 * Safe Object.entries that returns empty array for null/undefined
 */
export function safeEntries<T extends object>(
  obj: T | null | undefined,
): Array<[keyof T, T[keyof T]]> {
  if (obj == null) {
    console.warn(
      "safeEntries called with null/undefined, returning empty array",
    );
    return [];
  }
  return Object.entries(obj) as Array<[keyof T, T[keyof T]]>;
}

/**
 * Safe Object.keys that returns empty array for null/undefined
 */
export function safeKeys<T extends object>(
  obj: T | null | undefined,
): Array<keyof T> {
  if (obj == null) {
    console.warn("safeKeys called with null/undefined, returning empty array");
    return [];
  }
  return Object.keys(obj) as Array<keyof T>;
}

/**
 * Safe Object.values that returns empty array for null/undefined
 */
export function safeValues<T extends object>(
  obj: T | null | undefined,
): Array<T[keyof T]> {
  if (obj == null) {
    console.warn(
      "safeValues called with null/undefined, returning empty array",
    );
    return [];
  }
  return Object.values(obj) as Array<T[keyof T]>;
}

/**
 * Type guard to check if value is defined (not null or undefined)
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Type guard for non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Type guard for non-empty array
 */
export function isNonEmptyArray<T>(value: unknown): value is T[] {
  return Array.isArray(value) && value.length > 0;
}
