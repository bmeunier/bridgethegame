This script triggers the full pipeline (ingest → transcribe → diarize → enrich → index) and
monitors it until completion. It also validates that the `enriched.json` file in S3 is
non-empty at the end.

Save this as `scripts/test_pipeline_end_to_end.ts`.

```ts
#!/usr/bin/env npx tsx

/**
 * End-to-End Pipeline Test Harness (Improved)
 *
 * - Triggers the complete pipeline for a given episode
 * - Polls the Inngest Dev Server to monitor run status
 * - Verifies enriched.json exists in S3 and contains segments
 *
 * Usage:
 *   npx tsx scripts/test_pipeline_end_to_end.ts <episode_id>
 */

import "dotenv/config";
import { inngest } from "../src/inngest/client";
import { getStorageClient } from "../src/lib/storage";
import { keys } from "../src/lib/keys";

interface InngestRunStatus {
  id: string;
  status: "Running" | "Completed" | "Failed" | "Cancelled";
  started_at?: string;
  ended_at?: string;
  output?: any;
  error?: any;
  event_id?: string;
}

async function triggerEpisode(episodeId: string): Promise<string> {
  console.log(`🚀 Triggering pipeline for episode: ${episodeId}`);

  try {
    const ingestEvent = await inngest.send({
      name: "podbean.episode.ingest.requested",
      data: {
        episode_id: episodeId,
        force: true,
        mode: "end_to_end_test",
        requested_by: "end_to_end_test_harness",
        timestamp: Date.now(),
      },
    });

    const eventId = ingestEvent.ids[0];
    console.log(`✅ Episode ingest event sent successfully`);
    console.log(`   Event ID: ${eventId}`);
    return eventId;
  } catch (error) {
    console.error(`❌ Failed to trigger pipeline:`, error);
    throw error;
  }
}

async function pollRunStatus(eventId: string): Promise<boolean> {
  const runsUrl = `http://localhost:8288/v0/runs`;
  console.log(`
🔍 Monitoring Inngest runs for event ID: ${eventId}`);

  let status = "Running";
  const maxAttempts = 60; // 5 minutes max
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${runsUrl}?limit=50`);
      if (!response.ok) {
        console.warn(`⚠️ API request failed (${response.status}). Retrying...`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
        continue;
      }

      const runsData = (await response.json()) as { data: InngestRunStatus[] };
      const runs = runsData.data || [];

      const ourRun = runs.find(
        (run) => run.event_id === eventId || run.id === eventId,
      );
      if (!ourRun) {
        console.log(`⏱️ [${attempt * 5}s] Run not found yet, waiting...`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
        continue;
      }

      status = ourRun.status;
      const elapsed = `${attempt * 5}s`;
      console.log(`⏱️ [${elapsed}] Run status: ${status}`);

      if (status === "Completed") {
        console.log(`
✅ Pipeline completed successfully!`);
        console.log(`   Started: ${ourRun.started_at}`);
        console.log(`   Ended: ${ourRun.ended_at}`);
        return true;
      }

      if (status === "Failed") {
        console.error(`
❌ Pipeline failed`);
        if (ourRun.error) {
          console.error(`   Error: ${JSON.stringify(ourRun.error, null, 2)}`);
        }
        return false;
      }

      if (status === "Cancelled") {
        console.error(`
🚫 Pipeline was cancelled`);
        return false;
      }
    } catch (error) {
      console.warn(`⚠️ Error polling run status: ${error}. Retrying...`);
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  console.error(`
⏰ Timeout waiting for pipeline to finish`);
  return false;
}

async function checkEnrichedFile(episodeId: string): Promise<boolean> {
  console.log(`
📂 Checking enriched.json in S3 for episode ${episodeId}`);
  try {
    const storage = getStorageClient();
    const enrichedKey = keys.enriched(episodeId);
    const enriched = await storage.loadJson(enrichedKey);

    if (!Array.isArray(enriched) || enriched.length === 0) {
      console.error(`❌ Enriched file is empty or invalid!`);
      return false;
    }

    console.log(`✅ Enriched file found with ${enriched.length} segments`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to check enriched.json:`, error);
    return false;
  }
}

async function main() {
  const episodeId = process.argv[2];
  if (!episodeId) {
    console.error(
      "❌ Usage: npx tsx scripts/test_pipeline_end_to_end.ts <episode_id>",
    );
    process.exit(1);
  }

  console.log(`🧪 Starting End-to-End Pipeline Test for ${episodeId}`);

  const eventId = await triggerEpisode(episodeId);
  const pipelineOk = await pollRunStatus(eventId);

  if (!pipelineOk) {
    console.error(`💥 End-to-end test FAILED at pipeline stage`);
    process.exit(1);
  }

  const enrichedOk = await checkEnrichedFile(episodeId);

  if (enrichedOk) {
    console.log(`🎉 End-to-end test PASSED for episode ${episodeId}!`);
    process.exit(0);
  } else {
    console.error(`💥 End-to-end test FAILED at enrichment validation`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}
```
