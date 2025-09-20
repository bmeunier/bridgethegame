import { serve } from "inngest/express";
import express from "express";
import { inngest } from "./client";
import { ingestEpisode } from "./functions/ingest_episode";
import { transcribeEpisode } from "./functions/transcribe_episode";
import * as dotenv from "dotenv";

dotenv.config();

const app = express();

// Add body parsing middleware with increased limits for large payloads
app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: "application/json", limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve Inngest functions
app.use(
  "/api/inngest",
  serve({
    client: inngest,
    functions: [ingestEpisode, transcribeEpisode],
  })
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Inngest server running on http://localhost:${PORT}`);
  console.log(`Inngest endpoint: http://localhost:${PORT}/api/inngest`);
});