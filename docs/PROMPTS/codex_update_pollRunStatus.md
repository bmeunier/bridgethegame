# Codex Prompt: Update pollRunStatus with Auto-Detect Endpoint

You are editing `scripts/test_pipeline_end_to_end.ts` in the **BridgeTheGame** project.

The current `pollRunStatus` function assumes the Inngest dev server always exposes `/v0/runs`.  
In reality, different CLI versions expose either `/v0/runs` or `/api/v1/runs`.  
This causes 404 or HTML errors when polling for run status.

## Task

Replace the entire `pollRunStatus` function with the improved version below.

Requirements:

- Try both endpoints: `/v0/runs` and `/api/v1/runs`.
- Use the first one that responds with valid JSON.
- Log which endpoint was selected.
- Keep the existing run status polling logic (Completed, Failed, Cancelled, timeout).
- Exit codes remain the same (0 on success, 1 on failure).
- Must compile with TypeScript.

## Deliverable

Replace only the `pollRunStatus` function in `scripts/test_pipeline_end_to_end.ts` with this code:

```ts
async function pollRunStatus(eventId: string): Promise<boolean> {
  const endpoints = [
    "http://localhost:8288/v0/runs?limit=50",
    "http://localhost:8288/api/v1/runs?limit=50",
  ];

  let chosenEndpoint: string | null = null;

  // Try each endpoint until we find one that returns valid JSON
  for (const url of endpoints) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const text = await response.text();
        try {
          JSON.parse(text);
          chosenEndpoint = url;
          console.log(`🌐 Using Inngest runs endpoint: ${url}`);
          break;
        } catch {
          console.warn(`⚠️ Endpoint ${url} returned non-JSON, skipping`);
        }
      } else {
        console.warn(`⚠️ Endpoint ${url} returned status ${response.status}`);
      }
    } catch (err) {
      console.warn(`⚠️ Could not reach ${url}:`, err);
    }
  }

  if (!chosenEndpoint) {
    console.error(
      "❌ No valid Inngest runs endpoint found. Is the dev server running?",
    );
    return false;
  }

  let status = "Running";
  const maxAttempts = 60; // 5 minutes max
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(chosenEndpoint);
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
        console.log(`\n✅ Pipeline completed successfully!`);
        console.log(`   Started: ${ourRun.started_at}`);
        console.log(`   Ended: ${ourRun.ended_at}`);
        return true;
      }

      if (status === "Failed") {
        console.error(`\n❌ Pipeline failed`);
        if (ourRun.error) {
          console.error(`   Error: ${JSON.stringify(ourRun.error, null, 2)}`);
        }
        return false;
      }

      if (status === "Cancelled") {
        console.error(`\n🚫 Pipeline was cancelled`);
        return false;
      }
    } catch (error) {
      console.warn(`⚠️ Error polling run status: ${error}. Retrying...`);
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  console.error(`\n⏰ Timeout waiting for pipeline to finish`);
  return false;
}
```

## Instruction

Apply this replacement in the file, then re-run the test:

```bash
npx tsx scripts/test_pipeline_end_to_end.ts WRQZ7196C943
```

You should now see logs confirming which endpoint (`/v0/runs` or `/api/v1/runs`) is selected, and the script will proceed with monitoring runs correctly.
