/**
 * Inngest function for Pyannote speaker diarization and identification
 *
 * STATELESS S3-FIRST PATTERN:
 * - Every step rehydrates data from S3 (no closure variables)
 * - Large data always saved to S3, never returned inline
 * - Step outputs kept tiny (keys + small stats only)
 * - Guard checks prevent null/undefined crashes
 * - Full retry safety: steps can fail and retry without data loss
 */

import { inngest } from "../client";
import { keys } from "../../lib/keys";
import { mustLoadJson, tryLoadJson, saveJson } from "../../lib/storage_safe";
import { safeEntries, isDefined } from "../../lib/guards";
import { minimalStepResult } from "../../lib/safe_step_output";
import {
  diarize,
  identifySpeaker,
  enrichTranscript,
  groupSegmentsBySpeaker,
  selectRepresentativeSegment,
} from "../../lib/pyannote";
import {
  getSpeakerRegistry,
  getAudioClipUrl,
  getDeepgramDiarizationFallback,
} from "../../lib/speaker-utils";
import {
  DiarizationRequestEvent,
  SpeakerMap,
  NearMiss,
  PyannoteAuditArtifacts,
  ClusterSummary,
  EnrichedTranscriptSegment,
  PyannoteDiarizationResponse,
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
    const { episode_id, podcast_id, audio_url, transcript_key } =
      event.data as DiarizationRequestEvent;

    // Log start
    console.log(
      JSON.stringify({
        scope: "diarize_episode",
        status: "started",
        episode_id,
        podcast_id,
        audio_url,
        transcript_key,
      }),
    );

    // Validate inputs
    if (!episode_id || !podcast_id || !audio_url || !transcript_key) {
      const error =
        "Missing required parameters: episode_id, podcast_id, audio_url, transcript_key";
      console.error(
        JSON.stringify({
          scope: "diarize_episode",
          status: "error",
          error_type: "validation",
          message: error,
        }),
      );
      throw new Error(error);
    }

    if (!process.env.PYANNOTE_API_KEY) {
      throw new Error("Missing PYANNOTE_API_KEY in environment");
    }

    // Step 1: Diarize audio (Pyannote or fallback) - S3 first pattern
    const diarizationResult = await step.run(
      "pyannote-diarization",
      async () => {
        const diarizationKey = keys.diarizationRaw(episode_id);

        try {
          // Try Pyannote diarization
          const result = await diarize(
            audio_url,
            process.env.PYANNOTE_API_KEY!,
          );

          // Save immediately to S3
          await saveJson(diarizationKey, result);

          console.log(
            JSON.stringify({
              scope: "diarize_episode",
              action: "diarization_success",
              episode_id,
              source: "pyannote_precision2",
              segments_count: result.segments?.length ?? 0,
              diarization_key: diarizationKey,
            }),
          );

          return minimalStepResult(
            episode_id,
            { diarization: diarizationKey },
            {
              segments: result.segments?.length ?? 0,
              source: "pyannote_precision2",
            },
          );
        } catch (error) {
          console.warn(
            JSON.stringify({
              scope: "diarize_episode",
              action: "diarization_fallback",
              episode_id,
              pyannote_error:
                error instanceof Error ? error.message : String(error),
            }),
          );

          // Fallback to Deepgram
          const fallback = await getDeepgramDiarizationFallback(episode_id);

          // Save fallback to S3
          await saveJson(diarizationKey, fallback);

          console.log(
            JSON.stringify({
              scope: "diarize_episode",
              action: "fallback_success",
              episode_id,
              source: "deepgram_fallback",
              segments_count: fallback.segments?.length ?? 0,
              diarization_key: diarizationKey,
            }),
          );

          return minimalStepResult(
            episode_id,
            { diarization: diarizationKey },
            {
              segments: fallback.segments?.length ?? 0,
              source: "deepgram_fallback",
            },
          );
        }
      },
    );

    // Step 2: Identify speakers by cluster - stateless pattern
    const speakerResult = await step.run(
      "cluster-speaker-identification",
      async () => {
        // ALWAYS rehydrate from S3 at step start (stateless pattern)
        const diarizationKey = keys.diarizationRaw(episode_id);
        const raw = await mustLoadJson<PyannoteDiarizationResponse>(
          diarizationKey,
          "diarization",
        );

        console.log(
          JSON.stringify({
            scope: "diarize_episode",
            step: "cluster-speaker-identification",
            action: "reload_from_storage",
            episode_id,
            diarization_key: diarizationKey,
            segments: raw?.segments?.length ?? 0,
          }),
        );

        // Load speaker registry
        const registry = await getSpeakerRegistry(podcast_id);

        // Group segments by speaker (safe with guards)
        const segments = raw?.segments || [];
        const clusters = groupSegmentsBySpeaker(segments);

        const identifiedSpeakers: SpeakerMap = {};
        const missedMatches: NearMiss[] = [];

        // Process each cluster safely
        for (const [clusterKey, clusterSegments] of safeEntries(clusters)) {
          if (!clusterSegments || clusterSegments.length === 0) continue;

          // Select representative segment
          const repSegment = selectRepresentativeSegment(clusterSegments);
          const clipUrl = await getAudioClipUrl(
            audio_url,
            repSegment.start,
            repSegment.end,
          );

          let bestMatch = null;
          let bestConfidence = 0;
          let bestThreshold = 0;

          // Test against all registered speakers
          for (const [, info] of safeEntries(registry)) {
            if (!info) continue;

            try {
              const result = await identifySpeaker(
                clipUrl,
                process.env.PYANNOTE_API_KEY!,
                info.referenceId,
              );

              if (result.confidence > bestConfidence) {
                bestConfidence = result.confidence;
                bestMatch = info;
                bestThreshold = info.threshold;
              }
            } catch (error) {
              console.warn(
                JSON.stringify({
                  scope: "diarize_episode",
                  action: "identify_error",
                  episode_id,
                  cluster_key: clusterKey,
                  reference_id: info?.referenceId,
                  error: error instanceof Error ? error.message : String(error),
                }),
              );
            }
          }

          // Apply threshold and record results
          if (bestMatch && bestConfidence >= bestThreshold) {
            identifiedSpeakers[clusterKey] = {
              displayName: bestMatch.displayName,
              confidence: bestConfidence,
              referenceId: bestMatch.referenceId,
            };

            console.log(
              JSON.stringify({
                scope: "diarize_episode",
                action: "speaker_identified",
                episode_id,
                cluster_key: clusterKey,
                speaker: bestMatch.displayName,
                confidence: bestConfidence,
                threshold: bestThreshold,
              }),
            );
          } else if (bestMatch) {
            // Record near-miss
            missedMatches.push({
              clusterKey,
              confidence: bestConfidence,
              threshold: bestThreshold,
              referenceId: bestMatch.referenceId,
            });

            console.warn(
              JSON.stringify({
                scope: "diarize_episode",
                action: "near_miss",
                episode_id,
                cluster_key: clusterKey,
                confidence: bestConfidence,
                threshold: bestThreshold,
                reference_id: bestMatch.referenceId,
              }),
            );
          }
        }

        // Save speaker map and near-misses to S3
        const speakerMapKey = keys.speakerMap(episode_id);
        const nearMissesKey = keys.nearMisses(episode_id);

        await saveJson(speakerMapKey, identifiedSpeakers);
        await saveJson(nearMissesKey, missedMatches);

        console.log(
          JSON.stringify({
            scope: "diarize_episode",
            action: "identification_complete",
            episode_id,
            identified: Object.keys(identifiedSpeakers).length,
            near_misses: missedMatches.length,
            total_clusters: Object.keys(clusters).length,
          }),
        );

        return minimalStepResult(
          episode_id,
          {
            speaker_map: speakerMapKey,
            near_misses: nearMissesKey,
          },
          {
            identified: Object.keys(identifiedSpeakers).length,
            near_misses: missedMatches.length,
            clusters: Object.keys(clusters).length,
          },
        );
      },
    );

    // Step 3: Enrich transcript with speaker labels - stateless, fallback-aware
    const enrichmentResult = await step.run("enrich-transcript", async () => {
      // ALWAYS rehydrate from S3 (stateless pattern)
      const transcript = await mustLoadJson<TranscriptEnvelope>(
        transcript_key,
        "transcript",
      );
      const diar = await tryLoadJson<PyannoteDiarizationResponse>(
        keys.diarizationRaw(episode_id),
      );
      const spkMap =
        (await tryLoadJson<SpeakerMap>(keys.speakerMap(episode_id))) ?? {};

      console.log(
        JSON.stringify({
          scope: "diarize_episode",
          step: "enrich-transcript",
          action: "reload_from_storage",
          episode_id,
          transcript_utterances: transcript?.utterances?.length ?? 0,
          diarization_segments: diar?.segments?.length ?? 0,
          speaker_map_size: Object.keys(spkMap).length,
        }),
      );

      let enriched: EnrichedTranscriptSegment[];

      if (diar && isDefined(diar.segments)) {
        // Use Pyannote diarization with IoU merge
        // Fallback to words if utterances are empty
        const transcriptData =
          transcript.utterances && transcript.utterances.length > 0
            ? transcript.utterances
            : transcript.words || [];

        enriched = enrichTranscript(transcriptData, diar, spkMap);

        console.log(
          JSON.stringify({
            scope: "diarize_episode",
            action: "enrichment_with_pyannote",
            episode_id,
            enriched_segments: enriched.length,
            identified: enriched.filter((s) => s.speaker_confidence !== null)
              .length,
          }),
        );
      } else {
        // Fallback: use Deepgram speakers if available
        console.warn(
          JSON.stringify({
            scope: "diarize_episode",
            action: "enrichment_fallback",
            episode_id,
            reason: "no_pyannote_diarization",
          }),
        );

        // Create basic enriched segments from utterances or words
        const transcriptData =
          transcript.utterances && transcript.utterances.length > 0
            ? transcript.utterances
            : transcript.words || [];

        enriched = transcriptData.map((item) => ({
          start: item.start,
          end: item.end,
          text: "text" in item ? item.text : "word" in item ? item.word : "",
          speaker: item.speaker || "Unknown",
          diar_speaker: item.speaker || "unknown",
          speaker_confidence: null,
          source: "deepgram_fallback" as const,
        }));
      }

      // Save enriched transcript to S3
      const enrichedKey = keys.enriched(episode_id);
      await saveJson(enrichedKey, enriched);

      console.log(
        JSON.stringify({
          scope: "diarize_episode",
          action: "enrichment_saved",
          episode_id,
          enriched_key: enrichedKey,
          segments: enriched.length,
          identified: enriched.filter((s) => s.speaker_confidence !== null)
            .length,
        }),
      );

      return minimalStepResult(
        episode_id,
        { enriched: enrichedKey },
        {
          segments: enriched.length,
          identified: enriched.filter((s) => s.speaker_confidence !== null)
            .length,
          source: diar?.source || "deepgram_fallback",
        },
      );
    });

    // Step 4: Save audit artifacts - stateless pattern
    await step.run("save-audit-artifacts", async () => {
      // ALWAYS rehydrate all needed data from S3
      const diar = await tryLoadJson<PyannoteDiarizationResponse>(
        keys.diarizationRaw(episode_id),
      );
      const spkMap =
        (await tryLoadJson<SpeakerMap>(keys.speakerMap(episode_id))) ?? {};
      const nearMisses =
        (await tryLoadJson<NearMiss[]>(keys.nearMisses(episode_id))) ?? [];

      console.log(
        JSON.stringify({
          scope: "diarize_episode",
          step: "save-audit-artifacts",
          action: "reload_from_storage",
          episode_id,
          has_diarization: isDefined(diar),
          speaker_map_size: Object.keys(spkMap).length,
          near_misses_count: nearMisses.length,
        }),
      );

      // Create audit artifacts
      let clusterSummaries: ClusterSummary[] = [];

      if (diar && isDefined(diar.segments)) {
        const clusters = groupSegmentsBySpeaker(diar.segments);
        clusterSummaries = Object.entries(clusters).map(([key, segs]) => ({
          speakerKey: key,
          duration: segs.reduce((acc, s) => acc + (s.end - s.start), 0),
          segmentsCount: segs.length,
          mappedTo: spkMap[key]?.displayName || null,
          confidence: spkMap[key]?.confidence || null,
        }));
      }

      const audit: PyannoteAuditArtifacts = {
        clusters: clusterSummaries,
        totalSegments: diar?.segments?.length ?? 0,
        source: diar?.source || "deepgram_fallback",
        nearMisses,
      };

      // Save audit artifacts
      const auditKey = `diarization/${episode_id}/audit.json`;
      await saveJson(auditKey, audit);

      console.log(
        JSON.stringify({
          scope: "diarize_episode",
          action: "audit_saved",
          episode_id,
          audit_key: auditKey,
          clusters: clusterSummaries.length,
          total_segments: audit.totalSegments,
        }),
      );

      return minimalStepResult(
        episode_id,
        { audit: auditKey },
        {
          clusters: clusterSummaries.length,
          total_segments: audit.totalSegments,
          source: audit.source,
        },
      );
    });

    // Step 5: Emit completion event
    await step.sendEvent("diarization-complete", {
      name: "episode.diarized.pyannote.completed",
      data: {
        episode_id,
        s3_enriched_path: keys.enriched(episode_id),
        s3_audit_path: `diarization/${episode_id}/audit.json`,
      },
    });

    const processingTime = Date.now() - startTime;

    // Log final success
    console.log(
      JSON.stringify({
        scope: "diarize_episode",
        status: "success",
        episode_id,
        processing_time_ms: processingTime,
        diarization_source: diarizationResult.stats.source,
        identified_speakers: speakerResult.stats.identified,
        near_misses: speakerResult.stats.near_misses,
        enriched_segments: enrichmentResult.stats.segments,
      }),
    );

    // Final return - minimal metadata only
    return minimalStepResult(
      episode_id,
      {
        enriched: keys.enriched(episode_id),
        audit: `diarization/${episode_id}/audit.json`,
      },
      {
        status: "success",
        processing_time_ms: processingTime,
        source: enrichmentResult.stats.source,
        segments: enrichmentResult.stats.segments,
        identified: enrichmentResult.stats.identified,
      },
    );
  },
);
