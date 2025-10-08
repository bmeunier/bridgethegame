/**
 * Pyannote API client for speaker diarization and identification
 *
 * This module implements the Plan 4 approach:
 * - Cluster-level speaker identification for efficiency
 * - IoU-based alignment between transcript and diarization segments
 * - Confidence preservation and near-miss tracking
 * - Fallback to Deepgram diarization when needed
 */

import {
  PyannoteDiarizationResponse,
  PyannoteSpeakerIdentificationResult,
  EnrichedTranscriptSegment,
  SpeakerMap,
  PyannoteSegment,
} from "../types/pyannote";
import { NormalizedWord, NormalizedUtterance } from "../types/deepgram";

const API_BASE = "https://api.pyannote.ai/v1";

/**
 * Call Pyannote diarization API to get speaker segments
 */
interface DiarizeOptions {
  maxSpeakers?: number;
  minDuration?: number;
  doOverlap?: boolean;
}

export async function diarize(
  audioUrl: string,
  apiKey: string,
  options: DiarizeOptions = {},
): Promise<PyannoteDiarizationResponse> {
  const { maxSpeakers = 3, minDuration, doOverlap } = options;

  console.log(
    JSON.stringify({
      scope: "pyannote_client",
      action: "diarize_start",
      audio_url: audioUrl,
      max_speakers: maxSpeakers,
      min_duration: minDuration,
      allow_overlap: doOverlap,
    }),
  );

  const res = await fetch(`${API_BASE}/diarize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: audioUrl,
      max_speakers: maxSpeakers,
      ...(typeof minDuration === "number" ? { min_duration: minDuration } : {}),
      ...(typeof doOverlap === "boolean" ? { do_overlap: doOverlap } : {}),
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    const error = new Error(`Diarization failed: ${res.status} ${errorText}`);
    console.error(
      JSON.stringify({
        scope: "pyannote_client",
        action: "diarize_error",
        status: res.status,
        error: errorText,
      }),
    );
    throw error;
  }

  const data = await res.json();

  console.log(
    JSON.stringify({
      scope: "pyannote_client",
      action: "diarize_success",
      segments_count: data.segments?.length || 0,
    }),
  );

  return {
    segments: data.segments || [],
    source: "pyannote",
  };
}

const IDENTIFY_POLL_INTERVAL_MS = 2000;
const IDENTIFY_TIMEOUT_MS = 120000;

interface IdentifyJobPayload {
  status?: string;
  result?: {
    matches?: boolean;
    confidence?: number;
    predictions?: Array<{ label?: string; confidence?: number }>;
    scores?: Array<{ label?: string; confidence?: number }>;
  };
  output?: {
    matches?: boolean;
    confidence?: number;
    predictions?: Array<{ label?: string; confidence?: number }>;
  };
  error?: string;
}

/**
 * Identify speaker for a given audio segment using stored voiceprint.
 * Returns detailed result for cluster-level processing.
 */
export async function identifySpeaker(
  segmentUrl: string,
  apiKey: string,
  refId: string,
): Promise<PyannoteSpeakerIdentificationResult> {
  console.log(
    JSON.stringify({
      scope: "pyannote_client",
      action: "identify_start",
      reference_id: refId,
    }),
  );

  try {
    // Load the stored voiceprint for this reference ID
    const { getStorageClient } = await import("./storage");
    const storage = getStorageClient();
    const voiceprintKey = `voiceprints/profiles/${refId}.json`;

    const voiceprintData = await storage.loadJson<{
      referenceId: string;
      speakerName: string;
      voiceprint: string;
      model: string;
    }>(voiceprintKey);

    console.log(
      JSON.stringify({
        scope: "pyannote_client",
        action: "voiceprint_loaded",
        reference_id: refId,
        speaker_name: voiceprintData.speakerName,
        model: voiceprintData.model,
      }),
    );

    // Call Pyannote identification API with the voiceprint
    const res = await fetch(`${API_BASE}/identify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: segmentUrl,
        voiceprints: [
          {
            label: voiceprintData.speakerName,
            voiceprint: voiceprintData.voiceprint,
          },
        ],
        model: voiceprintData.model,
        confidence: true, // Include confidence scores
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      const error = new Error(
        `Speaker identification failed: ${res.status} ${errorText}`,
      );
      console.error(
        JSON.stringify({
          scope: "pyannote_client",
          action: "identify_error",
          reference_id: refId,
          status: res.status,
          error: errorText,
        }),
      );
      throw error;
    }

    const identifyJob = await res.json();

    console.log(
      JSON.stringify({
        scope: "pyannote_client",
        action: "identify_job_created",
        job_id: identifyJob.jobId,
        reference_id: refId,
      }),
    );

    const jobStatus = await pollIdentifyJob(identifyJob.jobId, apiKey, refId);

    const resultPayload = jobStatus.result || jobStatus.output || {};
    const confidenceFromResult =
      typeof (resultPayload as any).confidence === "number"
        ? (resultPayload as any).confidence
        : extractBestConfidence(resultPayload) ?? 0;

    const matches =
      typeof (resultPayload as any).matches === "boolean"
        ? (resultPayload as any).matches
        : confidenceFromResult >= 0.5; // Conservative default when API omits explicit match flag

    const result: PyannoteSpeakerIdentificationResult = {
      matches,
      confidence: confidenceFromResult,
      referenceId: refId,
    };

    console.log(
      JSON.stringify({
        scope: "pyannote_client",
        action: "identify_success",
        reference_id: refId,
        confidence: result.confidence,
        matches: result.matches,
      }),
    );

    return result;
  } catch (error) {
    console.error(
      JSON.stringify({
        scope: "pyannote_client",
        action: "identify_error",
        reference_id: refId,
        error: error instanceof Error ? error.message : error,
      }),
    );

    // Return a failed result instead of throwing
    return {
      matches: false,
      confidence: 0,
      referenceId: refId,
    };
  }
}

async function pollIdentifyJob(
  jobId: string,
  apiKey: string,
  refId: string,
): Promise<IdentifyJobPayload> {
  const start = Date.now();

  while (Date.now() - start < IDENTIFY_TIMEOUT_MS) {
    const response = await fetch(`${API_BASE}/jobs/${jobId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch identify job ${jobId}: ${response.status} ${errorText}`,
      );
    }

    const payload = (await response.json()) as IdentifyJobPayload;
    const status = (payload.status || "").toLowerCase();

    console.log(
      JSON.stringify({
        scope: "pyannote_client",
        action: "identify_poll",
        reference_id: refId,
        job_id: jobId,
        status,
      }),
    );

    if (status === "done" || status === "succeeded") {
      return payload;
    }

    if (status === "error" || status === "failed" || status === "cancelled") {
      throw new Error(
        payload.error || `Identify job ${jobId} returned ${status}`,
      );
    }

    await new Promise((resolve) =>
      setTimeout(resolve, IDENTIFY_POLL_INTERVAL_MS),
    );
  }

  throw new Error(`Timeout waiting for identify job ${jobId}`);
}

function extractBestConfidence(
  result: IdentifyJobPayload["result"] | IdentifyJobPayload["output"],
): number | undefined {
  if (!result) return undefined;

  const candidateSources = [
    (result as any).predictions,
    (result as any).scores,
  ];
  for (const source of candidateSources) {
    if (Array.isArray(source) && source.length > 0) {
      const best = source.reduce((acc, item) => {
        if (!item) return acc;
        const itemConfidence =
          typeof item.confidence === "number" ? item.confidence : acc;
        return itemConfidence > acc ? itemConfidence : acc;
      }, 0);
      if (best > 0) {
        return best;
      }
    }
  }

  return undefined;
}

/**
 * Enrich transcript by aligning transcript words with diarization segments using overlap (IoU) matching.
 * Applies speaker labels and confidence scores from cluster-level identification.
 */
export function enrichTranscript(
  transcript: (NormalizedWord | NormalizedUtterance)[],
  diarization: PyannoteDiarizationResponse,
  speakerMap: SpeakerMap = {},
): EnrichedTranscriptSegment[] {
  const enriched: EnrichedTranscriptSegment[] = [];

  console.log(
    JSON.stringify({
      scope: "pyannote_client",
      action: "enrich_start",
      transcript_segments: transcript.length,
      diarization_segments: diarization.segments.length,
      speaker_mappings: Object.keys(speakerMap).length,
    }),
  );

  // For each transcript word/segment, find overlapping diarization segment by IoU
  for (const t of transcript) {
    let matchedSegment: PyannoteSegment | null = null;
    let maxIoU = 0;

    for (const seg of diarization.segments) {
      const overlapStart = Math.max(t.start, seg.start);
      const overlapEnd = Math.min(t.end, seg.end);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      const union = Math.max(t.end, seg.end) - Math.min(t.start, seg.start);
      const iou = overlap / union;

      if (iou > maxIoU) {
        maxIoU = iou;
        matchedSegment = seg;
      }
    }

    const diarSpeaker = matchedSegment ? matchedSegment.speaker : "Unknown";
    let speaker = diarSpeaker;

    if (speakerMap[diarSpeaker]) {
      speaker = speakerMap[diarSpeaker].displayName;
    }

    const speakerConfidence = speakerMap[diarSpeaker]?.confidence ?? null;

    enriched.push({
      start: t.start,
      end: t.end,
      text: "text" in t ? t.text : "word" in t ? t.word : "",
      speaker,
      diar_speaker: diarSpeaker,
      speaker_confidence: speakerConfidence,
      source: diarization.source || "pyannote",
    });
  }

  console.log(
    JSON.stringify({
      scope: "pyannote_client",
      action: "enrich_complete",
      enriched_segments: enriched.length,
      identified_speakers: Object.values(speakerMap).map((s) => s.displayName),
    }),
  );

  return enriched;
}

/**
 * Group diarization segments by speaker key for cluster-level processing
 */
export function groupSegmentsBySpeaker(
  segments: PyannoteSegment[],
): Record<string, PyannoteSegment[]> {
  const clusters: Record<string, PyannoteSegment[]> = {};

  for (const seg of segments) {
    if (!clusters[seg.speaker]) {
      clusters[seg.speaker] = [];
    }
    clusters[seg.speaker].push(seg);
  }

  console.log(
    JSON.stringify({
      scope: "pyannote_client",
      action: "clustering_complete",
      clusters_count: Object.keys(clusters).length,
      cluster_sizes: Object.entries(clusters).map(([key, segs]) => ({
        speaker: key,
        segments: segs.length,
        total_duration: segs.reduce((acc, s) => acc + (s.end - s.start), 0),
      })),
    }),
  );

  return clusters;
}

/**
 * Select a representative segment from a cluster for speaker identification
 * Uses the middle segment to avoid potential silence at start/end
 */
export function selectRepresentativeSegment(
  segments: PyannoteSegment[],
): PyannoteSegment {
  if (segments.length === 0) {
    throw new Error("Cannot select representative from empty segment list");
  }

  // Sort by duration descending, then pick the middle one
  const sortedByDuration = [...segments].sort(
    (a, b) => b.end - b.start - (a.end - a.start),
  );
  const representative =
    sortedByDuration[Math.floor(sortedByDuration.length / 2)];

  console.log(
    JSON.stringify({
      scope: "pyannote_client",
      action: "representative_selected",
      cluster_size: segments.length,
      selected_duration: representative.end - representative.start,
      selected_start: representative.start,
    }),
  );

  return representative;
}

export type { DiarizeOptions };
