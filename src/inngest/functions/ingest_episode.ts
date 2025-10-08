import { inngest } from "../client";
import { podbeanClient, PodbeanClient } from "../../lib/podbean";

/**
 * Inngest function to ingest a podcast episode
 */
export const ingestEpisode = inngest.createFunction(
  {
    id: "ingest-episode",
    name: "Ingest Podcast Episode",
    retries: 3,
    concurrency: {
      limit: 5, // Limit concurrent executions to avoid rate limits
    },
    idempotency: "event.data.episode_id", // Prevent duplicate processing per episode
  },
  { event: "podbean.episode.ingest.requested" },
  async ({ event, step }) => {
    const startTime = Date.now();

    // Log incoming request
    console.log(
      JSON.stringify({
        scope: "ingest_episode",
        status: "started",
        episode_id: event.data.episode_id,
        mode: event.data.mode,
        force: event.data.force,
        priority: event.data.priority,
        requested_by: event.data.requested_by,
      }),
    );

    // Validate episode ID format
    if (!PodbeanClient.validateEpisodeId(event.data.episode_id)) {
      const errorLog = {
        scope: "ingest_episode",
        status: "error",
        episode_id: event.data.episode_id,
        error_type: "validation",
        message: "Invalid episode ID format",
      };
      console.error(JSON.stringify(errorLog));
      throw new Error("Invalid episode ID format");
    }

    // Note: Idempotency is now handled by Inngest based on episode_id
    // Episodes won't be reprocessed unless this function is called with force=true

    // Fetch episode metadata from Podbean
    const episode = await step.run("fetch-episode-metadata", async () => {
      try {
        const episodeData = await podbeanClient.getEpisode(
          event.data.episode_id,
        );

        console.log(
          JSON.stringify({
            scope: "ingest_episode",
            status: "metadata_fetched",
            episode_id: event.data.episode_id,
            title: episodeData.title,
            duration: episodeData.duration,
            publish_time: episodeData.publish_time,
          }),
        );

        return episodeData;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        let errorType = "unknown";

        if (errorMessage.includes("not found")) {
          errorType = "not_found";
        } else if (
          errorMessage.includes("Authentication") ||
          errorMessage.includes("token")
        ) {
          errorType = "auth";
        } else if (errorMessage.includes("Rate limited")) {
          errorType = "rate_limit";
        }

        const errorLog = {
          scope: "ingest_episode",
          status: "error",
          episode_id: event.data.episode_id,
          error_type: errorType,
          message: errorMessage,
        };
        console.error(JSON.stringify(errorLog));
        throw error;
      }
    });

    // Trigger Deepgram transcription
    await step.sendEvent("trigger-transcription", {
      name: "episode.transcribe.requested",
      data: {
        episode_id: event.data.episode_id,
        audio_url: episode.media_url,
        force: event.data.force,
      },
    });

    // TODO: Future steps will be added here
    // - Pyannote diarization
    // - Data merging
    // - Weaviate indexing

    const processingTime = Date.now() - startTime;

    // Log success
    console.log(
      JSON.stringify({
        scope: "ingest_episode",
        status: "success",
        episode_id: event.data.episode_id,
        source: "podbean",
        mode: event.data.mode,
        processing_time_ms: processingTime,
        episode_title: episode.title,
      }),
    );

    return {
      status: "success",
      episode_id: event.data.episode_id,
      episode_title: episode.title,
      processing_time_ms: processingTime,
    };
  },
);
