/**
 * Pyannote voice enrollment API client
 *
 * This module handles creating and managing voice profiles (voiceprints)
 * using the Pyannote commercial API for speaker identification.
 */

const PYANNOTE_API_BASE = "https://api.pyannote.ai/v1";

export interface VoiceprintJob {
  jobId: string;
  status: 'pending' | 'created' | 'running' | 'succeeded' | 'failed' | 'canceled';
}

export interface VoiceprintResult {
  voiceprint: string; // Base64 encoded voiceprint
  duration: number;
  model: string;
  status: 'succeeded';
}

export interface VoiceprintCreationOptions {
  model?: 'precision-1' | 'precision-2';
  webhook?: string;
}

/**
 * Create a voiceprint from an audio URL
 */
export async function createVoiceprint(
  audioUrl: string,
  apiKey: string,
  options: VoiceprintCreationOptions = {}
): Promise<VoiceprintJob> {
  console.log(JSON.stringify({
    scope: 'pyannote_enrollment',
    action: 'voiceprint_create_start',
    audio_url: audioUrl,
    model: options.model || 'precision-2',
  }));

  const response = await fetch(`${PYANNOTE_API_BASE}/voiceprint`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: audioUrl,
      model: options.model || 'precision-2',
      webhook: options.webhook,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`Voiceprint creation failed: ${response.status} ${errorText}`);
    console.error(JSON.stringify({
      scope: 'pyannote_enrollment',
      action: 'voiceprint_create_error',
      status: response.status,
      error: errorText,
    }));
    throw error;
  }

  const result: VoiceprintJob = await response.json();

  console.log(JSON.stringify({
    scope: 'pyannote_enrollment',
    action: 'voiceprint_create_success',
    job_id: result.jobId,
    status: result.status,
  }));

  return result;
}

/**
 * Poll job status until completion
 */
export async function waitForVoiceprintCompletion(
  jobId: string,
  apiKey: string,
  timeoutMs: number = 300000 // 5 minutes
): Promise<VoiceprintResult> {
  const startTime = Date.now();
  const pollInterval = 2000; // 2 seconds

  console.log(JSON.stringify({
    scope: 'pyannote_enrollment',
    action: 'voiceprint_poll_start',
    job_id: jobId,
    timeout_ms: timeoutMs,
  }));

  while (Date.now() - startTime < timeoutMs) {
    const status = await getJobStatus(jobId, apiKey);

    console.log(JSON.stringify({
      scope: 'pyannote_enrollment',
      action: 'voiceprint_poll_status',
      job_id: jobId,
      status: status.status,
      elapsed_ms: Date.now() - startTime,
    }));

    if (status.status === 'succeeded') {
      console.log(JSON.stringify({
        scope: 'pyannote_enrollment',
        action: 'voiceprint_poll_complete',
        job_id: jobId,
        total_time_ms: Date.now() - startTime,
      }));
      return status as VoiceprintResult;
    }

    if (status.status === 'failed' || status.status === 'canceled') {
      throw new Error(`Voiceprint creation ${status.status}: ${JSON.stringify(status)}`);
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Voiceprint creation timed out after ${timeoutMs}ms`);
}

/**
 * Get job status
 */
async function getJobStatus(jobId: string, apiKey: string): Promise<any> {
  const response = await fetch(`${PYANNOTE_API_BASE}/jobs/${jobId}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get job status: ${response.status}`);
  }

  const result = await response.json();

  // Log the actual response structure for debugging
  console.log(JSON.stringify({
    scope: 'pyannote_enrollment',
    action: 'job_status_response',
    job_id: jobId,
    response: result,
  }));

  return result;
}

/**
 * Create voiceprint from multiple samples and combine them
 */
export async function createVoiceprintFromMultipleSamples(
  sampleUrls: string[],
  apiKey: string,
  speakerName: string,
  options: VoiceprintCreationOptions = {}
): Promise<string> {
  console.log(JSON.stringify({
    scope: 'pyannote_enrollment',
    action: 'multi_sample_start',
    speaker_name: speakerName,
    sample_count: sampleUrls.length,
  }));

  const voiceprints: string[] = [];

  // Create voiceprint for each sample
  for (let i = 0; i < sampleUrls.length; i++) {
    const sampleUrl = sampleUrls[i];

    console.log(JSON.stringify({
      scope: 'pyannote_enrollment',
      action: 'processing_sample',
      speaker_name: speakerName,
      sample_index: i + 1,
      sample_url: sampleUrl,
    }));

    try {
      // Create voiceprint job
      const job = await createVoiceprint(sampleUrl, apiKey, options);

      // Wait for completion
      const result = await waitForVoiceprintCompletion(job.jobId, apiKey);

      // Check if we have a voiceprint in the result
      if (result.voiceprint) {
        voiceprints.push(result.voiceprint);

        console.log(JSON.stringify({
          scope: 'pyannote_enrollment',
          action: 'sample_processed',
          speaker_name: speakerName,
          sample_index: i + 1,
          voiceprint_length: result.voiceprint.length,
          duration: result.duration || 'unknown',
        }));
      } else {
        // Handle case where voiceprint is not in the expected location
        console.error(JSON.stringify({
          scope: 'pyannote_enrollment',
          action: 'voiceprint_missing',
          speaker_name: speakerName,
          sample_index: i + 1,
          result_structure: Object.keys(result),
        }));

        // Try to extract voiceprint from different possible locations
        const voiceprint = result.output?.voiceprint || result.data?.voiceprint || result.result?.voiceprint;
        if (voiceprint) {
          voiceprints.push(voiceprint);
          console.log(JSON.stringify({
            scope: 'pyannote_enrollment',
            action: 'voiceprint_found_alternative',
            speaker_name: speakerName,
            sample_index: i + 1,
          }));
        } else {
          throw new Error(`No voiceprint found in result: ${JSON.stringify(result)}`);
        }
      }

    } catch (error) {
      console.error(JSON.stringify({
        scope: 'pyannote_enrollment',
        action: 'sample_error',
        speaker_name: speakerName,
        sample_index: i + 1,
        sample_url: sampleUrl,
        error: error instanceof Error ? error.message : error,
      }));
      throw error;
    }
  }

  // For Pyannote, we use the first (typically best quality) voiceprint as the reference
  // In practice, you might want to combine them or select the best one based on quality metrics
  const primaryVoiceprint = voiceprints[0];

  console.log(JSON.stringify({
    scope: 'pyannote_enrollment',
    action: 'multi_sample_complete',
    speaker_name: speakerName,
    samples_processed: voiceprints.length,
    primary_voiceprint_length: primaryVoiceprint.length,
  }));

  return primaryVoiceprint;
}

/**
 * Generate a reference ID for the speaker profile
 */
export function generateReferenceId(speakerName: string): string {
  const timestamp = Date.now();
  const cleanName = speakerName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `ref_${cleanName}_${timestamp}`;
}