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
import { safeStepOutput, createSafeStepResult } from "../../lib/inngest-utils";
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

    // Variables to store large data outside of step outputs
    let registry: any;
    let diarization: any;
    let speakerMap: SpeakerMap = {};
    let nearMisses: NearMiss[] = [];
    let enrichedTranscript: EnrichedTranscriptSegment[] = [];

    // Step 1: Load speaker registry (safe step output - metadata only)
    const registryResult = await step.run("load-speaker-registry", async () => {
      const speakerRegistry = await getSpeakerRegistry(podcast_id);

      console.log(JSON.stringify({
        scope: "diarize_episode",
        action: "registry_loaded",
        episode_id,
        registry_speakers: Object.keys(speakerRegistry).length,
      }));

      // Store registry in closure for use in later steps (avoid step output size limit)
      registry = speakerRegistry;

      return safeStepOutput({
        episode_id,
        speakers_count: Object.keys(speakerRegistry).length,
        speakers: Object.keys(speakerRegistry).slice(0, 5), // Only first 5 names for debugging
      }, "load-speaker-registry");
    });

    // Load transcript outside of step to avoid large output
    const transcript = await storage.loadJson<TranscriptEnvelope>(transcript_key);

    console.log(JSON.stringify({
      scope: "diarize_episode",
      action: "transcript_loaded",
      episode_id,
      transcript_words: transcript.words.length,
      transcript_utterances: transcript.utterances.length,
    }));

    // Step 2: Perform diarization and save to S3 (strict safe step output)
    const diarizationResult = await step.run("pyannote-diarization", async () => {
      try {
        const result = await diarize(audio_url, process.env.PYANNOTE_API_KEY!);

        // Save full diarization to S3 immediately
        const diarizationKey = PyannoteStorageKeys.getDiarizationKey(episode_id);
        await storage.saveJson(diarizationKey, result);

        console.log(JSON.stringify({
          scope: "diarize_episode",
          action: "diarization_success",
          episode_id,
          source: "pyannote",
          segments_count: result.segments.length,
          s3_key: diarizationKey,
        }));

        // Store for use outside step (avoids large step output)
        diarization = result;

        // Return ONLY safe metadata - no large JSON
        return safeStepOutput(
          createSafeStepResult(episode_id, diarizationKey, {
            source: "pyannote",
            segments_count: result.segments.length,
          }),
          "pyannote-diarization"
        );
      } catch (error) {
        console.warn(JSON.stringify({
          scope: "diarize_episode",
          action: "diarization_fallback",
          episode_id,
          pyannote_error: error instanceof Error ? error.message : error,
          message: "Falling back to Deepgram diarization",
        }));

        const fallback = await getDeepgramDiarizationFallback(episode_id);

        // Save fallback diarization to S3 immediately
        const fallbackKey = PyannoteStorageKeys.getDiarizationKey(episode_id);
        await storage.saveJson(fallbackKey, fallback);

        console.log(JSON.stringify({
          scope: "diarize_episode",
          action: "fallback_success",
          episode_id,
          source: "deepgram_fallback",
          segments_count: fallback.segments.length,
          s3_key: fallbackKey,
        }));

        // Store for use outside step
        diarization = fallback;

        // Return ONLY safe metadata
        return safeStepOutput(
          createSafeStepResult(episode_id, fallbackKey, {
            source: "deepgram_fallback",
            segments_count: fallback.segments.length,
          }),
          "pyannote-diarization-fallback"
        );
      }
    });

    // Step 3: Cluster-level speaker identification (strict safe step output)
    const speakerResult = await step.run("cluster-speaker-identification", async () => {
      // Reload diarization data from S3 if closure variable is undefined (function retry scenario)
      if (!diarization) {
        console.log(JSON.stringify({
          scope: "diarize_episode",
          action: "reload_diarization_from_s3",
          episode_id,
          reason: "closure_variable_undefined_after_retry",
        }));

        const diarizationKey = PyannoteStorageKeys.getDiarizationKey(episode_id);
        diarization = await storage.loadJson(diarizationKey);

        console.log(JSON.stringify({
          scope: "diarize_episode",
          action: "diarization_reloaded",
          episode_id,
          s3_key: diarizationKey,
          segments_count: diarization?.segments?.length || 0,
        }));
      }

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

      // Store in closure to avoid step output size limit
      speakerMap = identifiedSpeakers;
      nearMisses = missedMatches;

      // Return ONLY safe metadata - no large speaker map or near-misses
      return safeStepOutput({
        episode_id,
        identified_speakers_count: Object.keys(identifiedSpeakers).length,
        near_misses_count: missedMatches.length,
        total_clusters: Object.keys(clusters).length,
      }, "cluster-speaker-identification");
    });

    // Step 4: Enrich transcript with speaker information (strict safe step output)
    const enrichmentResult = await step.run("enrich-transcript", async () => {
      // Reload data from S3 if closure variables are undefined (function retry scenario)
      if (!diarization || !speakerMap) {
        console.log(JSON.stringify({
          scope: "diarize_episode",
          action: "reload_data_for_enrichment",
          episode_id,
          reason: "closure_variables_undefined_after_retry",
          diarization_undefined: !diarization,
          speaker_map_undefined: !speakerMap,
        }));

        // Reload diarization if needed
        if (!diarization) {
          const diarizationKey = PyannoteStorageKeys.getDiarizationKey(episode_id);
          diarization = await storage.loadJson(diarizationKey);
        }

        // For speakerMap, we need to reconstruct it from the previous step result
        if (!speakerMap || Object.keys(speakerMap).length === 0) {
          speakerMap = {}; // Will be empty, but function can continue
          console.log(JSON.stringify({
            scope: "diarize_episode",
            action: "speaker_map_unavailable",
            episode_id,
            message: "Cannot reload speakerMap from S3 - using empty map",
          }));
        }
      }

      // Use utterances for enrichment (more meaningful than individual words)
      enrichedTranscript = enrichTranscript(transcript.utterances, diarization, speakerMap);

      console.log(JSON.stringify({
        scope: "diarize_episode",
        action: "enrichment_complete",
        episode_id,
        enriched_segments: enrichedTranscript.length,
        identified_segments: enrichedTranscript.filter(s => s.speaker_confidence !== null).length,
      }));

      // Return ONLY safe metadata - NO large transcript data
      return safeStepOutput({
        episode_id,
        enriched_segments_count: enrichedTranscript.length,
        identified_segments_count: enrichedTranscript.filter(s => s.speaker_confidence !== null).length,
      }, "enrich-transcript");
    });

    // Step 5: Save enriched transcript and audit artifacts
    const { enrichedPath, auditPath } = await step.run("save-artifacts", async () => {
      // Reload data from S3 if closure variables are undefined (function retry scenario)
      if (!diarization || !enrichedTranscript || !speakerMap || !nearMisses) {
        console.log(JSON.stringify({
          scope: "diarize_episode",
          action: "reload_data_for_save_artifacts",
          episode_id,
          reason: "closure_variables_undefined_after_retry",
          diarization_undefined: !diarization,
          enriched_transcript_undefined: !enrichedTranscript,
          speaker_map_undefined: !speakerMap,
          near_misses_undefined: !nearMisses,
        }));

        // Reload diarization if needed
        if (!diarization) {
          const diarizationKey = PyannoteStorageKeys.getDiarizationKey(episode_id);
          diarization = await storage.loadJson(diarizationKey);
        }

        // For other variables that we can't reload, use fallbacks
        if (!enrichedTranscript) {
          enrichedTranscript = []; // Empty fallback - could also reload from S3 if saved earlier
        }
        if (!speakerMap) {
          speakerMap = {}; // Empty fallback
        }
        if (!nearMisses) {
          nearMisses = []; // Empty fallback
        }
      }

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
        storage.saveJson(enrichedKey, enrichedTranscript),
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

    // Final return - enforce safe size limit
    const finalResult = {
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

    return safeStepOutput(finalResult, "diarize-episode-final-return");
  }
);