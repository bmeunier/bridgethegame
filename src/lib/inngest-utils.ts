/**
 * Inngest utility functions for safe step output handling
 *
 * FUTURE MIGRATION NOTE:
 * Inngest is planning to add native step output size management.
 * When available, set INNGEST_NATIVE_LIMITS=true to disable our validation.
 */

/**
 * Maximum safe step output size in bytes (4KB - conservative limit)
 * Inngest has undocumented limits but errors occur around 32KB+
 * We use 4KB to ensure safety margin
 */
const MAX_STEP_OUTPUT_SIZE = 4 * 1024; // 4KB

/**
 * Feature flag for future Inngest native support
 * Set INNGEST_NATIVE_LIMITS=true when Inngest releases native step output management
 */
const USE_INNGEST_NATIVE_LIMITS = process.env.INNGEST_NATIVE_LIMITS === 'true';

/**
 * Safe step output wrapper that enforces size limits
 *
 * @param data - The data to return from a step
 * @param stepName - Name of the step for error reporting
 * @returns The data if under size limit
 * @throws Error if data exceeds size limit
 */
export function safeStepOutput<T>(data: T, stepName: string): T {
  // Future migration: When Inngest adds native support, bypass our validation
  if (USE_INNGEST_NATIVE_LIMITS) {
    console.log(JSON.stringify({
      scope: "inngest_utils",
      action: "native_limits_enabled",
      step_name: stepName,
      message: "Using Inngest native step output size management"
    }));
    return data;
  }

  const serialized = JSON.stringify(data);
  const sizeBytes = new TextEncoder().encode(serialized).length;

  if (sizeBytes > MAX_STEP_OUTPUT_SIZE) {
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
    const limitKB = (MAX_STEP_OUTPUT_SIZE / 1024).toFixed(1);

    console.error(JSON.stringify({
      scope: "inngest_utils",
      error: "step_output_too_large",
      step_name: stepName,
      size_bytes: sizeBytes,
      size_mb: sizeMB,
      limit_kb: limitKB,
      message: `Step output exceeds safe size limit. Use S3 storage for large data.`
    }));

    throw new Error(
      `Step "${stepName}" output too large: ${sizeMB}MB exceeds ${limitKB}KB limit. ` +
      `Store large data in S3 and return only metadata.`
    );
  }

  console.log(JSON.stringify({
    scope: "inngest_utils",
    action: "safe_step_output",
    step_name: stepName,
    size_bytes: sizeBytes,
    size_kb: (sizeBytes / 1024).toFixed(1)
  }));

  return data;
}

/**
 * Create a safe S3-first step output with metadata only
 */
export interface SafeStepResult {
  episode_id: string;
  storage_key: string;
  count?: number;
  size_bytes?: number;
  processing_time_ms?: number;
  [key: string]: any; // Allow additional small metadata
}

/**
 * Helper to create standardized safe step outputs
 */
export function createSafeStepResult(
  episodeId: string,
  storageKey: string,
  metadata: Record<string, any> = {}
): SafeStepResult {
  const result: SafeStepResult = {
    episode_id: episodeId,
    storage_key: storageKey,
    ...metadata
  };

  // Validate the result size
  return safeStepOutput(result, 'safe_step_result');
}