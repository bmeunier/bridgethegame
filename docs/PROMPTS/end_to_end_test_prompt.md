# End-to-End Pipeline Test Harness Prompt for Claude Code

This file provides Claude Code with instructions and a code skeleton for creating a test harness that validates the pipeline end-to-end. The goal is to ensure diarization and the full flow succeed in Inngest, not just step-level outputs.

---

## Prompt for Claude Code

Claude, add a new script `scripts/test_pipeline_end_to_end.ts` that:

1. Imports the existing trigger logic (like `trigger_fresh_pipeline.ts`).  
2. Starts a pipeline run for a known valid Podbean episode ID.  
3. Polls the Inngest Dev Server API (`http://localhost:8288/api/runs/:id`) every few seconds.  
4. Logs status until the run is either `Completed` or `Failed`.  
5. Exits with code 0 on success, 1 on failure.  

This script must prove the entire pipeline (ingest → transcribe → diarize) completes end-to-end, not just log step outputs.

---

## Suggested Code Skeleton

```ts
// scripts/test_pipeline_end_to_end.ts
import fetch from "node-fetch";
import { triggerEpisode } from "./trigger_fresh_pipeline";

async function main() {
  const episodeId = process.argv[2] || "WRQZ7196C943";

  console.log(`🚀 Triggering pipeline for episode: ${episodeId}`);
  const eventId = await triggerEpisode(episodeId);

  const runUrl = `http://localhost:8288/api/runs/${eventId}`;

  let status = "PENDING";
  for (let i = 0; i < 60; i++) { // poll for up to 5 min
    const res = await fetch(runUrl);
    const json = await res.json();
    status = json.status;
    console.log(`⏱️ Run status: ${status}`);

    if (status === "Completed") {
      console.log("✅ Pipeline completed successfully!");
      process.exit(0);
    }
    if (status === "Failed") {
      console.error("❌ Pipeline failed");
      process.exit(1);
    }
    await new Promise(r => setTimeout(r, 5000));
  }

  console.error("⏰ Timeout waiting for pipeline to finish");
  process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

---

## Deliverable

- Add `scripts/test_pipeline_end_to_end.ts` to the repo.  
- Ensure it can be run via:  
  ```bash
  npx tsx scripts/test_pipeline_end_to_end.ts WRQZ7196C943
  ```  
- Confirm it reports `✅ Pipeline completed successfully!` when diarization works fully end-to-end.
