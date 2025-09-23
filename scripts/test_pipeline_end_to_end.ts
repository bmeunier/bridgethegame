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