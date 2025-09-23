/**
 * Inngest function for Pyannote speaker diarization and identification
 *
 * This function implements Plan 4's cluster-level approach:
 * - Groups diarization segments by speaker
 * - Identifies speakers using representative clips
 * - Falls back to Deepgram diarization if Pyannote fails
 * - Tracks near-misses for threshold tuning
 * - Generates audit artifacts for debugging
 */

import { inngest } from "../client";
import { getStorageClient } from "../../lib/storage";
import {
  diarize,
  identifySpeaker,
  enrichTranscript,
  groupSegmentsBySpeaker,
  selectRepresentativeSegment
} from "../../lib/pyannote";
import {
  getSpeakerRegistry,
  getAudioClipUrl,
  getDeepgramDiarizationFallback,
  PyannoteStorageKeys
} from "../../lib/speaker-utils";
import {
  DiarizationRequestEvent,
  SpeakerMap,
  NearMiss,
  PyannoteAuditArtifacts,
  ClusterSummary,
  EnrichedTranscriptSegment,
} from "../../types/pyannote";
import { TranscriptEnvelope } from "../../types/deepgram";

/**
 * Inngest function to diarize episode and identify speakers
 */
export const diarizeEpisode = inngest.createFunction(
  {
    id: "episode.diarize.pyannote",
    name: "Diarize Episode with Pyannote",
    retries: 3,
    concurrency: {
      limit: 2, // Limit concurrent diarizations to avoid API limits
    },
    idempotency: "event.data.episode_id",
    throttle: {
      limit: 5,
      period: "60s", // Max 5 diarizations per minute
    },
  },
  { event: "episode.transcribed.deepgram.completed" },
  async ({ event, step }) => {
    const startTime = Date.now();
    const { episode_id, podcast_id, audio_url, transcript_key } = event.data as DiarizationRequestEvent;

    // Log start
    console.log(JSON.stringify({
      scope: "diarize_episode",
      status: "started",
      episode_id,
      podcast_id,
      audio_url,
      transcript_key,
    }));

    // Validate inputs
    if (!episode_id || !podcast_id || !audio_url || !transcript_key) {
      const error = "Missing required parameters: episode_id, podcast_id, audio_url, transcript_key";
      console.error(JSON.stringify({
        scope: "diarize_episode",
        status: "error",
        error_type: "validation",
        message: error,
      }));
      throw new Error(error);
    }

    const storage = getStorageClient();

    // Step 1: Load speaker registry and transcript
    const [registry, transcript] = await step.run("load-registry-and-transcript", async () => {
      const [speakerRegistry, transcriptData] = await Promise.all([
        getSpeakerRegistry(podcast_id),
        storage.loadJson<TranscriptEnvelope>(transcript_key),
      ]);

      console.log(JSON.stringify({
        scope: "diarize_episode",
        action: "data_loaded",
        episode_id,
        registry_speakers: Object.keys(speakerRegistry).length,
        transcript_words: transcriptData.words.length,
        transcript_utterances: transcriptData.utterances.length,
      }));

      return [speakerRegistry, transcriptData];
    });

    // Step 2: Perform diarization (with fallback)
    const diarization = await step.run("pyannote-diarization", async () => {
      try {
        const result = await diarize(audio_url, process.env.PYANNOTE_API_KEY!);

        console.log(JSON.stringify({
          scope: "diarize_episode",
          action: "diarization_success",
          episode_id,
          source: "pyannote",
          segments_count: result.segments.length,
        }));

        return result;
      } catch (error) {
        console.warn(JSON.stringify({
          scope: "diarize_episode",
          action: "diarization_fallback",
          episode_id,
          pyannote_error: error instanceof Error ? error.message : error,
          message: "Falling back to Deepgram diarization",
        }));

        const fallback = await getDeepgramDiarizationFallback(episode_id);

        console.log(JSON.stringify({
          scope: "diarize_episode",
          action: "fallback_success",
          episode_id,
          source: "deepgram_fallback",
          segments_count: fallback.segments.length,
        }));

        return fallback;
      }
    });

    // Step 3: Cluster-level speaker identification
    const { speakerMap, nearMisses } = await step.run("cluster-speaker-identification", async () => {
      const clusters = groupSegmentsBySpeaker(diarization.segments);
      const identifiedSpeakers: SpeakerMap = {};
      const missedMatches: NearMiss[] = [];

      // Process each cluster
      for (const [clusterKey, segments] of Object.entries(clusters)) {
        if (segments.length === 0) continue;

        // Select representative segment for identification
        const repSegment = selectRepresentativeSegment(segments);
        const clipUrl = await getAudioClipUrl(audio_url, repSegment.start, repSegment.end);

        let bestMatch = null;
        let bestConfidence = 0;
        let bestThreshold = 0;

        // Test against all registered speakers
        for (const [refId, info] of Object.entries(registry)) {
          try {
            const result = await identifySpeaker(clipUrl, process.env.PYANNOTE_API_KEY!, info.referenceId);

            if (result.confidence > bestConfidence) {
              bestConfidence = result.confidence;
              bestMatch = info;
              bestThreshold = info.threshold;
            }
          } catch (error) {
            console.warn(JSON.stringify({
              scope: "diarize_episode",
              action: "identify_error",
              episode_id,
              cluster_key: clusterKey,
              reference_id: info.referenceId,
              error: error instanceof Error ? error.message : error,
            }));
          }
        }

        // Apply threshold check and record results
        if (bestMatch && bestConfidence >= bestThreshold) {
          identifiedSpeakers[clusterKey] = {
            displayName: bestMatch.displayName,
            confidence: bestConfidence,
            referenceId: bestMatch.referenceId,
          };

          console.log(JSON.stringify({
            scope: "diarize_episode",
            action: "speaker_identified",
            episode_id,
            cluster_key: clusterKey,
            speaker: bestMatch.displayName,
            confidence: bestConfidence,
            threshold: bestThreshold,
          }));
        } else if (bestMatch) {
          // Record near-miss for threshold tuning
          const nearMiss: NearMiss = {
            clusterKey,
            confidence: bestConfidence,
            threshold: bestThreshold,
            referenceId: bestMatch.referenceId,
          };
          missedMatches.push(nearMiss);

          console.warn(JSON.stringify({
            scope: "diarize_episode",
            action: "near_miss",
            episode_id,
            cluster_key: clusterKey,
            confidence: bestConfidence,
            threshold: bestThreshold,
            reference_id: bestMatch.referenceId,
            message: `Confidence ${bestConfidence} below threshold ${bestThreshold}`,
          }));
        }
      }

      console.log(JSON.stringify({
        scope: "diarize_episode",
        action: "identification_complete",
        episode_id,
        identified_speakers: Object.keys(identifiedSpeakers).length,
        near_misses: missedMatches.length,
        total_clusters: Object.keys(clusters).length,
      }));

      return { speakerMap: identifiedSpeakers, nearMisses: missedMatches };
    });

    // Step 4: Enrich transcript with speaker information
    const enrichmentResult = await step.run("enrich-transcript", async () => {
      // Use utterances for enrichment (more meaningful than individual words)
      const enriched = enrichTranscript(transcript.utterances, diarization, speakerMap);

      console.log(JSON.stringify({
        scope: "diarize_episode",
        action: "enrichment_complete",
        episode_id,
        enriched_segments: enriched.length,
        identified_segments: enriched.filter(s => s.speaker_confidence !== null).length,
      }));

      // Return only summary data, not the full transcript
      return {
        enriched_segments_count: enriched.length,
        identified_segments_count: enriched.filter(s => s.speaker_confidence !== null).length,
        enriched_transcript: enriched, // Store for use in next step
      };
    });

    // Step 5: Save enriched transcript and audit artifacts
    const { enrichedPath, auditPath } = await step.run("save-artifacts", async () => {
      const enrichedKey = PyannoteStorageKeys.getEnrichedTranscriptKey(episode_id);
      const auditKey = PyannoteStorageKeys.getAuditArtifactsKey(episode_id);

      // Create audit artifacts
      const clusters = groupSegmentsBySpeaker(diarization.segments);
      const clusterSummaries: ClusterSummary[] = Object.entries(clusters).map(([key, segs]) => ({
        speakerKey: key,
        duration: segs.reduce((acc, s) => acc + (s.end - s.start), 0),
        segmentsCount: segs.length,
        mappedTo: speakerMap[key]?.displayName || null,
        confidence: speakerMap[key]?.confidence || null,
      }));

      const audit: PyannoteAuditArtifacts = {
        clusters: clusterSummaries,
        totalSegments: diarization.segments.length,
        source: diarization.source || 'pyannote',
        nearMisses,
      };

      // Save both artifacts
      await Promise.all([
        storage.saveJson(enrichedKey, enrichmentResult.enriched_transcript),
        storage.saveJson(auditKey, audit),
      ]);

      console.log(JSON.stringify({
        scope: "diarize_episode",
        action: "artifacts_saved",
        episode_id,
        enriched_key: enrichedKey,
        audit_key: auditKey,
      }));

      return { enrichedPath: enrichedKey, auditPath: auditKey };
    });

    // Step 6: Emit completion event
    await step.sendEvent("diarization-complete", {
      name: "episode.diarized.pyannote.completed",
      data: {
        episode_id,
        s3_enriched_path: enrichedPath,
        s3_audit_path: auditPath,
      },
    });

    const processingTime = Date.now() - startTime;

    // Log success
    console.log(JSON.stringify({
      scope: "diarize_episode",
      status: "success",
      episode_id,
      processing_time_ms: processingTime,
      diarization_source: diarization.source,
      identified_speakers: Object.keys(speakerMap).length,
      near_misses: nearMisses.length,
      enriched_segments: enrichmentResult.enriched_segments_count,
    }));

    return {
      status: "success",
      episode_id,
      diarization_source: diarization.source,
      identified_speakers: Object.keys(speakerMap).length,
      near_misses_count: nearMisses.length,
      enriched_segments_count: enrichmentResult.enriched_segments_count,
      processing_time_ms: processingTime,
      s3_enriched_path: enrichedPath,
      s3_audit_path: auditPath,
    };
  }
);