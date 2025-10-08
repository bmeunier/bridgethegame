/**
 * Safe storage helpers with automatic rehydration for retry resilience
 */

import { getStorageClient } from "./storage";

/**
 * Load JSON from storage and throw if missing
 * Use this when the data MUST exist
 */
export async function mustLoadJson<T>(key: string, what: string): Promise<T> {
  try {
    const storage = getStorageClient();
    const data = await storage.loadJson<T>(key);
    if (data == null) {
      throw new Error(`Missing required ${what} at ${key}`);
    }
    return data;
  } catch (error) {
    console.error(
      JSON.stringify({
        scope: "storage_safe",
        action: "must_load_json_error",
        key,
        what,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    throw new Error(
      `Failed to load required ${what} from ${key}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Try to load JSON from storage, return null if missing or error
 * Use this for optional data that might not exist yet
 */
export async function tryLoadJson<T>(key: string): Promise<T | null> {
  try {
    const storage = getStorageClient();
    const data = await storage.loadJson<T>(key);
    console.log(
      JSON.stringify({
        scope: "storage_safe",
        action: "try_load_json_success",
        key,
        found: data != null,
      }),
    );
    return data;
  } catch (error) {
    console.log(
      JSON.stringify({
        scope: "storage_safe",
        action: "try_load_json_not_found",
        key,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return null;
  }
}

/**
 * Save JSON to storage with structured logging
 */
export async function saveJson(key: string, data: any): Promise<void> {
  const storage = getStorageClient();
  return storage.saveJson(key, data);
}

/**
 * Load JSON from storage (re-export for consistency)
 */
export async function loadJson<T>(key: string): Promise<T> {
  const storage = getStorageClient();
  return storage.loadJson<T>(key);
}
