import { Inngest } from "inngest";

// Define our event types
type PodcastIngestEvent = {
  name: "podbean.episode.ingest.requested";
  data: {
    episode_id: string;
    mode: "backfill" | "manual" | "realtime";
    force: boolean;
    requested_by: string | null;
    priority: "normal" | "high";
  };
};

// Create type-safe Inngest client
export const inngest = new Inngest({
  id: "bridgethegame",
});

// Export event type for use in other files
export type { PodcastIngestEvent };