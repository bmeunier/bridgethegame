/**
 * Safe step output utilities shared across the pipeline.
 * Combines size enforcement (used synchronously in Inngest steps)
 * with the S3-first helpers used by retry-safe functions.
 */

import { saveJson } from "./storage_safe";

const MAX_S3_METADATA_SIZE = 100 * 1024; // 100KB max for persisted payloads
const MAX_STEP_OUTPUT_SIZE = 4 * 1024; // 4KB limit for data returned to Inngest
const USE_INNGEST_NATIVE_LIMITS = process.env.INNGEST_NATIVE_LIMITS === "true";

/**
 * Persist large payloads to S3 before returning minimal metadata.
 */
export async function persistStepOutput<T>(
  key: string,
  payload: T,
  metadata: Record<string, unknown> = {},
): Promise<{
  storage_key: string;
  metadata: Record<string, unknown>;
  size: number;
}> {
  const raw = JSON.stringify(payload);
  const size = Buffer.byteLength(raw);

  await saveJson(key, payload);

  console.log(
    JSON.stringify({
      scope: "safe_step_output",
      action: "saved_to_storage",
      key,
      size,
      forced_storage: size > MAX_S3_METADATA_SIZE,
    }),
  );

  return {
    storage_key: key,
    metadata: {
      ...metadata,
      bytes: size,
      forced_storage: size > MAX_S3_METADATA_SIZE,
    },
    size,
  };
}

/**
 * Check if a payload would exceed the S3 persistence safety limit.
 */
export function wouldExceedStepLimit(data: unknown): boolean {
  if (data == null) {
    return false;
  }
  try {
    const size = Buffer.byteLength(JSON.stringify(data));
    return size > MAX_S3_METADATA_SIZE;
  } catch (error) {
    console.error("Failed to check step output size:", error);
    return true;
  }
}

/**
 * Ensure step output data returned to Inngest stays below the safe limit.
 */
export function enforceStepOutputLimit<T>(data: T, stepName: string): T {
  if (USE_INNGEST_NATIVE_LIMITS) {
    console.log(
      JSON.stringify({
        scope: "safe_step_output",
        action: "native_limits_bypass",
        step_name: stepName,
      }),
    );
    return data;
  }

  const serialized = JSON.stringify(data);
  const sizeBytes = new TextEncoder().encode(serialized).length;

  if (sizeBytes > MAX_STEP_OUTPUT_SIZE) {
    const limitKB = (MAX_STEP_OUTPUT_SIZE / 1024).toFixed(1);
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);

    console.error(
      JSON.stringify({
        scope: "safe_step_output",
        error: "step_output_too_large",
        step_name: stepName,
        size_bytes: sizeBytes,
        size_mb: sizeMB,
        limit_kb: limitKB,
      }),
    );

    throw new Error(
      `Step "${stepName}" output too large: ${sizeMB}MB exceeds ${limitKB}KB limit. ` +
        "Store large data in S3 and return only metadata.",
    );
  }

  console.log(
    JSON.stringify({
      scope: "safe_step_output",
      action: "step_output_valid",
      step_name: stepName,
      size_bytes: sizeBytes,
      size_kb: (sizeBytes / 1024).toFixed(1),
    }),
  );

  return data;
}

/**
 * Build a minimal step result and enforce the Inngest size limit.
 */
export function createSafeStepResult(
  episodeId: string,
  storageKey: string,
  metadata: Record<string, any> = {},
): {
  episode_id: string;
  storage_key: string;
  [key: string]: any;
} {
  const result = {
    episode_id: episodeId,
    storage_key: storageKey,
    ...metadata,
  };

  return enforceStepOutputLimit(result, "safe_step_result");
}

/**
 * Create a minimal step result with just keys and stats for S3-first flow.
 */
export function minimalStepResult(
  episodeId: string,
  storageKeys: Record<string, string>,
  stats: Record<string, number | string> = {},
): {
  episode_id: string;
  keys: Record<string, string>;
  stats: Record<string, number | string>;
} {
  const result = {
    episode_id: episodeId,
    keys: storageKeys,
    stats,
  };

  return enforceStepOutputLimit(result, "minimal_step_result");
}

export const STEP_OUTPUT_LIMIT_BYTES = MAX_STEP_OUTPUT_SIZE;
