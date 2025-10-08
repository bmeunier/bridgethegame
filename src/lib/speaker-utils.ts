/**
 * Utility functions for speaker registry management and audio clip extraction
 */

import { getStorageClient, StorageClient } from "./storage";
import {
  SpeakerRegistry,
  PyannoteDiarizationResponse,
} from "../types/pyannote";
import { TranscriptEnvelope, DeepgramSpeakerSegment } from "../types/deepgram";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID, createHash } from "crypto";
import { spawn } from "child_process";

/**
 * Load speaker registry configuration for a given podcast
 * Registry is stored in S3 as JSON: speaker-registry/{podcast_id}.json
 */
export async function getSpeakerRegistry(
  podcastId: string,
): Promise<Record<string, any>> {
  const storage = getStorageClient();
  const registryKey = `speaker-registry/${podcastId}.json`;

  try {
    console.log(
      JSON.stringify({
        scope: "speaker_utils",
        action: "load_registry_start",
        podcast_id: podcastId,
        registry_key: registryKey,
      }),
    );

    const registryExists = await storage.exists(registryKey);
    if (!registryExists) {
      console.log(
        JSON.stringify({
          scope: "speaker_utils",
          action: "registry_not_found",
          podcast_id: podcastId,
          message: "No speaker registry found, using empty registry",
        }),
      );
      return {};
    }

    const registry = await storage.loadJson<SpeakerRegistry>(registryKey);
    const podcastRegistry = registry[podcastId] || {};

    console.log(
      JSON.stringify({
        scope: "speaker_utils",
        action: "load_registry_success",
        podcast_id: podcastId,
        speakers_count: Object.keys(podcastRegistry).length,
        speakers: Object.keys(podcastRegistry),
      }),
    );

    return podcastRegistry;
  } catch (error) {
    console.error(
      JSON.stringify({
        scope: "speaker_utils",
        action: "load_registry_error",
        podcast_id: podcastId,
        error: error instanceof Error ? error.message : error,
      }),
    );

    // Return empty registry on error to allow pipeline to continue
    return {};
  }
}

/**
 * Get a publicly accessible URL for an audio clip segment
 * This is a placeholder implementation - in production, you'd use a service like:
 * - AWS Lambda with FFmpeg to extract clips
 * - External audio processing service
 * - Pre-signed S3 URLs with query parameters for time ranges
 */
export async function getAudioClipUrl(
  audioUrl: string,
  startTime: number,
  endTime: number,
): Promise<string> {
  console.log(
    JSON.stringify({
      scope: "speaker_utils",
      action: "clip_extraction_requested",
      audio_url: audioUrl,
      start_time: startTime,
      end_time: endTime,
      duration: endTime - startTime,
    }),
  );

  if (
    Number.isNaN(startTime) ||
    Number.isNaN(endTime) ||
    endTime <= startTime
  ) {
    throw new Error("Invalid clip bounds supplied to getAudioClipUrl");
  }

  const storage = getStorageClient();
  const clipKey = buildClipStorageKey(audioUrl, startTime, endTime);

  // Extract clip locally using ffmpeg and upload to S3
  const tempDir = await fs.mkdtemp(join(tmpdir(), "btg-clip-"));
  const tempFile = join(tempDir, `${randomUUID()}.mp3`);

  try {
    await runFfmpegExtract(audioUrl, startTime, endTime, tempFile);
    const clipBuffer = await fs.readFile(tempFile);
    await storage.saveAudio(clipKey, clipBuffer, "audio/mpeg");

    console.log(
      JSON.stringify({
        scope: "speaker_utils",
        action: "clip_uploaded",
        clip_key: clipKey,
        size: clipBuffer.length,
      }),
    );

    const signedUrl = await storage.getSignedUrl(clipKey, 3600);

    console.log(
      JSON.stringify({
        scope: "speaker_utils",
        action: "clip_url_generated",
        clip_url: signedUrl,
      }),
    );

    return signedUrl;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Generate fallback diarization from Deepgram's sidecar data
 * Converts Deepgram speaker segments to Pyannote-compatible format
 */
export async function getDeepgramDiarizationFallback(
  episodeId: string,
): Promise<PyannoteDiarizationResponse> {
  const storage = getStorageClient();
  const transcriptKey = StorageClient.getTranscriptKey(episodeId, "deepgram");

  try {
    console.log(
      JSON.stringify({
        scope: "speaker_utils",
        action: "fallback_start",
        episode_id: episodeId,
        transcript_key: transcriptKey,
      }),
    );

    const transcript =
      await storage.loadJson<TranscriptEnvelope>(transcriptKey);

    if (
      !transcript.deepgram_speakers ||
      transcript.deepgram_speakers.length === 0
    ) {
      console.warn(
        JSON.stringify({
          scope: "speaker_utils",
          action: "fallback_no_speakers",
          episode_id: episodeId,
          message: "No Deepgram speaker data available for fallback",
        }),
      );

      // Return empty diarization
      return {
        segments: [],
        source: "deepgram_fallback",
      };
    }

    // Convert Deepgram speaker segments to Pyannote format
    const segments = transcript.deepgram_speakers.map(
      (dgSpeaker: DeepgramSpeakerSegment) => ({
        start: dgSpeaker.start,
        end: dgSpeaker.end,
        speaker: dgSpeaker.speaker, // Already formatted as "dg-0", "dg-1", etc.
      }),
    );

    console.log(
      JSON.stringify({
        scope: "speaker_utils",
        action: "fallback_success",
        episode_id: episodeId,
        segments_count: segments.length,
        speakers: [...new Set(segments.map((s) => s.speaker))],
      }),
    );

    return {
      segments,
      source: "deepgram_fallback",
    };
  } catch (error) {
    console.error(
      JSON.stringify({
        scope: "speaker_utils",
        action: "fallback_error",
        episode_id: episodeId,
        error: error instanceof Error ? error.message : error,
      }),
    );

    // Return empty diarization on error
    return {
      segments: [],
      source: "deepgram_fallback",
    };
  }
}

/**
 * Save speaker registry to S3
 * Utility function for managing speaker registries
 */
export async function saveSpeakerRegistry(
  registry: SpeakerRegistry,
): Promise<void> {
  const storage = getStorageClient();

  for (const [podcastId, speakers] of Object.entries(registry)) {
    const registryKey = `speaker-registry/${podcastId}.json`;

    try {
      console.log(
        JSON.stringify({
          scope: "speaker_utils",
          action: "save_registry_start",
          podcast_id: podcastId,
          speakers_count: Object.keys(speakers).length,
        }),
      );

      await storage.saveJson(registryKey, { [podcastId]: speakers });

      console.log(
        JSON.stringify({
          scope: "speaker_utils",
          action: "save_registry_success",
          podcast_id: podcastId,
          registry_key: registryKey,
        }),
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          scope: "speaker_utils",
          action: "save_registry_error",
          podcast_id: podcastId,
          error: error instanceof Error ? error.message : error,
        }),
      );
      throw error;
    }
  }
}

function buildClipStorageKey(
  audioUrl: string,
  startTime: number,
  endTime: number,
): string {
  const fingerprint = createHash("sha1")
    .update(`${audioUrl}:${startTime.toFixed(3)}:${endTime.toFixed(3)}`)
    .digest("hex");
  return `audio-clips/${fingerprint}.mp3`;
}

async function runFfmpegExtract(
  audioUrl: string,
  startTime: number,
  endTime: number,
  outputPath: string,
): Promise<void> {
  const args = [
    "-y",
    "-ss",
    startTime.toFixed(3),
    "-to",
    endTime.toFixed(3),
    "-i",
    audioUrl,
    "-c",
    "copy",
    outputPath,
  ];

  console.log(
    JSON.stringify({
      scope: "speaker_utils",
      action: "ffmpeg_start",
      args,
    }),
  );

  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", args, { stdio: "inherit" });

    ffmpeg.on("error", (error) => {
      reject(new Error(`Failed to start ffmpeg: ${error.message}`));
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  });

  console.log(
    JSON.stringify({
      scope: "speaker_utils",
      action: "ffmpeg_complete",
      output: outputPath,
    }),
  );
}

/**
 * Generate S3 keys for pyannote artifacts
 */
export class PyannoteStorageKeys {
  static getDiarizationKey(episodeId: string): string {
    return `transcripts/${episodeId}/diarization.json`;
  }

  static getEnrichedTranscriptKey(episodeId: string): string {
    return `transcripts/${episodeId}/enriched.json`;
  }

  static getAuditArtifactsKey(episodeId: string): string {
    return `transcripts/${episodeId}/pyannote_audit.json`;
  }

  static getAudioClipKey(
    episodeId: string,
    speakerKey: string,
    startTime: number,
  ): string {
    return `audio-clips/${episodeId}/${speakerKey}_${Math.round(startTime * 1000)}.mp3`;
  }
}
