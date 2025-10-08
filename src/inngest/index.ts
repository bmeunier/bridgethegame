import { serve } from "inngest/express";
import express from "express";
import { inngest } from "./client";
import { ingestEpisode } from "./functions/ingest_episode";
import { transcribeEpisode } from "./functions/transcribe_episode";
import { diarizeEpisode } from "./functions/diarize_episode";
import * as dotenv from "dotenv";

dotenv.config();

const app = express();

// Add logging middleware
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Add body parsing middleware with configurable limits for very long podcast episodes
// 3+ hour episodes can generate 50mb+ transcript JSON files
const BODY_LIMIT = process.env.EXPRESS_BODY_LIMIT || "100mb";
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.raw({ type: "application/json", limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

// Debug function registration
console.log("Registering functions:");
console.log(
  "- ingestEpisode:",
  typeof ingestEpisode,
  ingestEpisode.id || "no id",
);
console.log(
  "- transcribeEpisode:",
  typeof transcribeEpisode,
  transcribeEpisode.id || "no id",
);
console.log(
  "- diarizeEpisode:",
  typeof diarizeEpisode,
  diarizeEpisode.id || "no id",
);

const functions = [ingestEpisode, transcribeEpisode, diarizeEpisode];
console.log(`Total functions to register: ${functions.length}`);

// Serve Inngest functions
app.use(
  "/api/inngest",
  serve({
    client: inngest,
    functions: functions,
  }),
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Inngest server running on http://localhost:${PORT}`);
  console.log(`Inngest endpoint: http://localhost:${PORT}/api/inngest`);
});
