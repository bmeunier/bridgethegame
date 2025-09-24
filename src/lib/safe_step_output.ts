/**
 * Safe step output utility to ensure Inngest step outputs stay small
 * Always writes to storage and returns tiny metadata
 */

import { saveJson } from './storage_safe';

const MAX_SIZE = 100 * 1024; // 100KB max for step outputs

/**
 * Safe step output that always writes to storage and returns minimal metadata
 * This prevents Inngest step output size errors
 */
export async function safeStepOutput<T>(
  key: string,
  payload: T,
  metadata: Record<string, unknown> = {}
): Promise<{
  storage_key: string;
  metadata: Record<string, unknown>;
  size: number;
}> {
  const raw = JSON.stringify(payload);
  const size = Buffer.byteLength(raw);

  // Always write to storage for consistency, even if small
  // This ensures retry safety - data is always in S3
  await saveJson(key, payload);

  console.log(JSON.stringify({
    scope: 'safe_step_output',
    action: 'saved_to_storage',
    key,
    size,
    forced_storage: size > MAX_SIZE,
  }));

  // Return minimal metadata - never the actual data
  return {
    storage_key: key,
    metadata: {
      ...metadata,
      bytes: size,
      forced_storage: size > MAX_SIZE,
    },
    size,
  };
}

/**
 * Check if a step output would be too large
 * Useful for pre-flight checks
 */
export function wouldExceedStepLimit(data: unknown): boolean {
  try {
    const size = Buffer.byteLength(JSON.stringify(data));
    return size > MAX_SIZE;
  } catch (error) {
    console.error('Failed to check step output size:', error);
    // If we can't serialize it, it's probably too big
    return true;
  }
}

/**
 * Create a minimal step result with just keys and stats
 * This is the preferred pattern for all step outputs
 */
export function minimalStepResult(
  episodeId: string,
  storageKeys: Record<string, string>,
  stats: Record<string, number | string> = {}
): {
  episode_id: string;
  keys: Record<string, string>;
  stats: Record<string, number | string>;
} {
  return {
    episode_id: episodeId,
    keys: storageKeys,
    stats,
  };
}