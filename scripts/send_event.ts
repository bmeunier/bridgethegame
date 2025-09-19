import { inngest } from "../src/inngest/client";
import { PodbeanClient } from "../src/lib/podbean";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * CLI script to trigger episode ingestion
 * Usage: npm run trigger <episode_id> [mode] [force]
 * Example: npm run trigger ABC123DEF456 backfill false
 */
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Error: Episode ID is required");
    console.log("Usage: npm run trigger <episode_id> [mode] [force]");
    console.log("Example: npm run trigger ABC123DEF456");
    console.log("         npm run trigger ABC123DEF456 backfill true");

    // Show example episode IDs if configured
    if (process.env.TEST_EPISODE_ID_1 || process.env.TEST_EPISODE_ID_2) {
      console.log("\nExample episode IDs from .env:");
      if (process.env.TEST_EPISODE_ID_1) {
        console.log(`  - ${process.env.TEST_EPISODE_ID_1}`);
      }
      if (process.env.TEST_EPISODE_ID_2) {
        console.log(`  - ${process.env.TEST_EPISODE_ID_2}`);
      }
    }
    process.exit(1);
  }

  const episodeId = args[0];
  const mode = (args[1] || "backfill") as "backfill" | "manual" | "realtime";
  const force = args[2] === "true";

  // Validate episode ID format
  if (!PodbeanClient.validateEpisodeId(episodeId)) {
    console.error(`Error: Invalid episode ID format: ${episodeId}`);
    console.log("Episode ID should be alphanumeric (with optional hyphens/underscores)");
    process.exit(1);
  }

  console.log("Sending event to Inngest:");
  console.log(JSON.stringify({
    episode_id: episodeId,
    mode,
    force,
    requested_by: "cli",
    priority: "normal",
  }, null, 2));

  try {
    // Send event to Inngest
    const result = await inngest.send({
      name: "podbean.episode.ingest.requested",
      data: {
        episode_id: episodeId,
        mode,
        force,
        requested_by: "cli",
        priority: "normal",
      },
    });

    console.log("\nEvent sent successfully!");
    console.log("Event ID:", result.ids[0]);
    console.log("\nCheck Inngest Dev Server at http://localhost:8288 to see the function run");
  } catch (error) {
    console.error("Failed to send event:", error);
    console.error("\nMake sure:");
    console.error("1. Inngest Dev Server is running: npm run inngest-dev");
    console.error("2. Express server is running: npm run dev");
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});