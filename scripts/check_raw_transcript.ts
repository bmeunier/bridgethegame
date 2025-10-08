#!/usr/bin/env npx tsx

import "dotenv/config";
import { checkRawTranscript } from "../src/lib/check-utils";

const episodeId = process.argv[2];

if (!episodeId) {
  throw new Error("Usage: tsx scripts/check_raw_transcript.ts <episodeId>");
}

checkRawTranscript(episodeId).catch((error) => {
  console.error(error);
  process.exit(1);
});
