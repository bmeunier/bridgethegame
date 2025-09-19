import { serve } from "inngest/express";
import express from "express";
import { inngest } from "./client";
import { ingestEpisode } from "./functions/ingest_episode";
import * as dotenv from "dotenv";

dotenv.config();

const app = express();

// Add body parsing middleware
app.use(express.json());
app.use(express.raw({ type: "application/json" }));

// Serve Inngest functions
app.use(
  "/api/inngest",
  serve({
    client: inngest,
    functions: [ingestEpisode],
  })
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Inngest server running on http://localhost:${PORT}`);
  console.log(`Inngest endpoint: http://localhost:${PORT}/api/inngest`);
});