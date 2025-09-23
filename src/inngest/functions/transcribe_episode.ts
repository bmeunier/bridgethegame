import { inngest } from "../client";
import { deepgramClient } from "../../lib/deepgram";
import { AudioFetcher } from "../../lib/audio";
import { getStorageClient, StorageClient } from "../../lib/storage";
import { TranscriptEnvelope, DeepgramApiResponse } from "../../types/deepgram";

/**
 * Inngest function to transcribe episode audio using Deepgram
 */
export const transcribeEpisode = inngest.createFunction(
  {
    id: "episode.ingest.transcribe",
    name: "Transcribe Episode with Deepgram",
    retries: 3,
    concurrency: {
      limit: 3, // Limit concurrent transcriptions
    },
    idempotency: "event.data.episode_id",
    throttle: {
      limit: 10,
      period: "60s", // Max 10 transcriptions per minute
    },
  },
  { event: "episode.transcribe.requested" },
  async ({ event, step }) => {
    const startTime = Date.now();
    const { episode_id, audio_url, force = false } = event.data;

    // Log start
    console.log(JSON.stringify({
      scope: "transcribe_episode",
      status: "started",
      episode_id,
      audio_url,
      force,
    }));

    // Validate inputs
    if (!episode_id || !audio_url) {
      const error = "Missing required parameters: episode_id and audio_url";
      console.error(JSON.stringify({
        scope: "transcribe_episode",
        status: "error",
        error_type: "validation",
        message: error,
      }));
      throw new Error(error);
    }

    const storage = getStorageClient();

    // Check if transcript already exists (unless force=true)
    const transcriptKey = StorageClient.getTranscriptKey(episode_id, 'deepgram');
    if (!force) {
      const exists = await step.run("check-existing-transcript", async () => {
        return await storage.exists(transcriptKey);
      });

      if (exists) {
        console.log(JSON.stringify({
          scope: "transcribe_episode",
          status: "skipped",
          episode_id,
          reason: "transcript_exists",
          s3_key: transcriptKey,
        }));

        // Load cached transcript to emit completion event and return cached metadata
        const existingTranscript = await storage.loadJson<TranscriptEnvelope>(transcriptKey);

        await step.sendEvent("transcript-complete", {
          name: "episode.transcript.completed",
          data: {
            episode_id,
            transcript_key: transcriptKey,
            word_count: existingTranscript.words?.length || 0,
            duration: existingTranscript.metadata?.duration || 0,
          },
        });

        return {
          status: "skipped",
          episode_id,
          message: "Transcript already exists",
          transcript_key: transcriptKey,
          duration: existingTranscript.metadata?.duration || 0,
        };
      }
    }

    // Step 1: Fetch audio (may use S3 cache)
    const audioData = await step.run("fetch-audio", async () => {
      try {
        // For Deepgram, we can use URL directly or buffer
        // Using URL is more efficient for large files
        // Just validate the URL here
        if (!AudioFetcher.isValidAudioUrl(audio_url)) {
          throw new Error(`Invalid audio URL: ${audio_url}`);
        }

        console.log(JSON.stringify({
          scope: "transcribe_episode",
          action: "audio_validated",
          episode_id,
          audio_url,
        }));

        return { url: audio_url };
      } catch (error) {
        console.error(JSON.stringify({
          scope: "transcribe_episode",
          status: "error",
          error_type: "audio_fetch",
          episode_id,
          message: error instanceof Error ? error.message : "Unknown error",
        }));
        throw error;
      }
    });

    // Step 2: Call Deepgram API and save raw response to S3
    const deepgramMetadata = await step.run("deepgram-transcribe", async () => {
      try {
        const response = await deepgramClient.transcribeFromUrl(audioData.url, {
          model: "general",
          punctuate: true,
          utterances: true,
          paragraphs: true,
          timestamps: true,
          diarize: true, // Enable for sidecar field (pyannote will override later)
          filler_words: false,
          profanity_filter: false,
          language: "en",
          smart_format: true,
        });

        // Validate response
        if (!response.results?.channels?.[0]?.alternatives?.[0]) {
          throw new Error("Invalid Deepgram response structure");
        }

        // Check for language detection if not English
        const detectedLanguage = response.results.channels[0].alternatives[0].transcript
          ? "en" // Deepgram doesn't return language in this mode
          : "unknown";

        if (detectedLanguage !== "en") {
          console.warn(JSON.stringify({
            scope: "transcribe_episode",
            warning: "non_english_detected",
            episode_id,
            detected_language: detectedLanguage,
          }));
        }

        const wordCount = response.results.channels[0].alternatives[0].words?.length || 0;
        const utteranceCount = response.results.channels[0].alternatives[0].utterances?.length || 0;

        console.log(JSON.stringify({
          scope: "transcribe_episode",
          action: "deepgram_success",
          episode_id,
          request_id: response.metadata.request_id,
          duration: response.metadata.duration,
          word_count: wordCount,
        }));

        // Save raw response to S3 immediately
        const rawKey = StorageClient.getTranscriptKey(episode_id, 'deepgram_raw');

        try {
          await storage.saveJson(rawKey, response);

          console.log(JSON.stringify({
            scope: "transcribe_episode",
            action: "raw_saved_to_s3",
            episode_id,
            s3_key: rawKey,
          }));
        } catch (s3Error) {
          console.error(JSON.stringify({
            scope: "transcribe_episode",
            status: "error",
            error_type: "s3_save_raw",
            episode_id,
            message: s3Error instanceof Error ? s3Error.message : "Unknown error",
          }));
          throw s3Error;
        }

        // Return only lightweight metadata
        return {
          s3_raw_key: rawKey,
          request_id: response.metadata.request_id,
          duration: response.metadata.duration,
          word_count: wordCount,
          utterance_count: utteranceCount,
        };
      } catch (error) {
        console.error(JSON.stringify({
          scope: "transcribe_episode",
          status: "error",
          error_type: "deepgram_api",
          episode_id,
          message: error instanceof Error ? error.message : "Unknown error",
        }));
        throw error;
      }
    });

    // Step 3: Load from S3, parse, normalize, and save transcript
    const transcriptSummary = await step.run("parse-and-save-transcript", async () => {
      try {
        // Load raw response from S3
        console.log(JSON.stringify({
          scope: "transcribe_episode",
          action: "loading_raw_from_s3",
          episode_id,
          s3_key: deepgramMetadata.s3_raw_key,
        }));

        const deepgramResponse = await storage.loadJson<DeepgramApiResponse>(deepgramMetadata.s3_raw_key);

        // Parse the response
        const envelope = deepgramClient.parseResponse(
          episode_id,
          deepgramResponse,
          deepgramMetadata.s3_raw_key
        );

        // Validate envelope
        if (!envelope.words || envelope.words.length === 0) {
          console.warn(JSON.stringify({
            scope: "transcribe_episode",
            warning: "empty_transcript",
            episode_id,
          }));
        }

        console.log(JSON.stringify({
          scope: "transcribe_episode",
          action: "parse_success",
          episode_id,
          word_count: envelope.words.length,
          utterance_count: envelope.utterances.length,
          paragraph_count: envelope.paragraphs.length,
        }));

        // Save normalized envelope to S3
        const normalizedKey = StorageClient.getTranscriptKey(episode_id, 'deepgram');

        try {
          await storage.saveJson(normalizedKey, envelope);

          console.log(JSON.stringify({
            scope: "transcribe_episode",
            action: "normalized_saved_to_s3",
            episode_id,
            transcript_key: normalizedKey,
          }));
        } catch (saveError) {
          console.error(JSON.stringify({
            scope: "transcribe_episode",
            status: "error",
            error_type: "s3_save_normalized",
            episode_id,
            message: saveError instanceof Error ? saveError.message : "Unknown error",
          }));

          // Keep the raw payload intact so retries can re-parse it
          throw saveError;
        }

        // Return only summary data to avoid Inngest output_too_large error
        return {
          word_count: envelope.words.length,
          utterance_count: envelope.utterances.length,
          paragraph_count: envelope.paragraphs.length,
          duration: envelope.metadata?.duration || 0,
          transcript_key: normalizedKey,
        };
      } catch (error) {
        console.error(JSON.stringify({
          scope: "transcribe_episode",
          status: "error",
          error_type: "parse_and_save",
          episode_id,
          message: error instanceof Error ? error.message : "Unknown error",
        }));
        throw error;
      }
    });

    // Step 4: Emit completion event to trigger diarization
    await step.sendEvent("transcript-complete", {
      name: "episode.transcribed.deepgram.completed",
      data: {
        episode_id,
        podcast_id: "askthegame", // TODO: Make this configurable for multi-podcast support
        audio_url,
        transcript_key: transcriptSummary.transcript_key,
        word_count: transcriptSummary.word_count,
        duration: transcriptSummary.duration,
      },
    });

    const processingTime = Date.now() - startTime;

    // Log success
    console.log(JSON.stringify({
      scope: "transcribe_episode",
      status: "success",
      episode_id,
      processing_time_ms: processingTime,
      word_count: transcriptSummary.word_count,
      duration: transcriptSummary.duration,
    }));

    return {
      status: "success",
      episode_id,
      transcript_key: transcriptSummary.transcript_key,
      word_count: transcriptSummary.word_count,
      utterance_count: transcriptSummary.utterance_count,
      paragraph_count: transcriptSummary.paragraph_count,
      duration: transcriptSummary.duration,
      processing_time_ms: processingTime,
    };
  }
);
