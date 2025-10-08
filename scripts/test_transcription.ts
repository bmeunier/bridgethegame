#!/usr/bin/env tsx
/**
 * Test script for Deepgram transcription
 * Usage: npm run test:transcribe -- <episode_id> <audio_url>
 * Or: tsx scripts/test_transcription.ts <episode_id> <audio_url>
 */

import * as dotenv from "dotenv";
import { deepgramClient } from "../src/lib/deepgram";
import { getStorageClient, StorageClient } from "../src/lib/storage";

dotenv.config();

async function testTranscription() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error("Usage: npm run test:transcribe -- <episode_id> <audio_url>");
    console.error(
      "Example: npm run test:transcribe -- test-123 https://example.com/audio.mp3",
    );
    process.exit(1);
  }

  const [episodeId, audioUrl] = args;

  console.log("🎙️ Testing Deepgram Transcription");
  console.log("Episode ID:", episodeId);
  console.log("Audio URL:", audioUrl);
  console.log("---");

  try {
    // Test 1: Validate environment
    console.log("1️⃣ Checking environment variables...");
    if (!process.env.DEEPGRAM_API_KEY) {
      throw new Error("DEEPGRAM_API_KEY not set in .env");
    }
    if (!process.env.S3_BUCKET_NAME) {
      console.warn("⚠️  S3_BUCKET_NAME not set - storage will fail");
    }
    console.log("✅ Environment configured\n");

    // Test 2: Call Deepgram API
    console.log("2️⃣ Calling Deepgram API...");
    const startTime = Date.now();

    const response = await deepgramClient.transcribeFromUrl(audioUrl, {
      model: "general",
      punctuate: true,
      utterances: true,
      paragraphs: true,
      timestamps: true,
      diarize: false,
      language: "en",
    });

    const apiTime = Date.now() - startTime;
    console.log(`✅ Deepgram response received in ${apiTime}ms`);
    console.log(`   Duration: ${response.metadata.duration}s`);
    console.log(`   Request ID: ${response.metadata.request_id}\n`);

    // Test 3: Parse response
    console.log("3️⃣ Parsing response...");
    const envelope = deepgramClient.parseResponse(episodeId, response);

    console.log(`✅ Transcript parsed successfully`);
    console.log(`   Words: ${envelope.words.length}`);
    console.log(`   Utterances: ${envelope.utterances.length}`);
    console.log(`   Paragraphs: ${envelope.paragraphs.length}\n`);

    // Test 4: Sample output
    console.log("4️⃣ Sample transcript (first 100 words):");
    const sampleText = envelope.words
      .slice(0, 100)
      .map((w) => w.word)
      .join(" ");
    console.log(`   "${sampleText}..."\n`);

    // Test 5: Save to storage (optional)
    if (process.env.S3_BUCKET_NAME) {
      console.log("5️⃣ Saving to S3...");
      const storage = getStorageClient();

      const transcriptKey = StorageClient.getTranscriptKey(
        episodeId,
        "deepgram",
      );
      await storage.saveJson(transcriptKey, envelope);

      const rawKey = StorageClient.getTranscriptKey(episodeId, "deepgram_raw");
      await storage.saveJson(rawKey, response);

      console.log(`✅ Saved to S3`);
      console.log(`   Transcript: ${transcriptKey}`);
      console.log(`   Raw: ${rawKey}\n`);
    } else {
      console.log("5️⃣ Skipping S3 save (no bucket configured)\n");
    }

    // Summary
    console.log("🎉 Test completed successfully!");
    console.log("---");
    console.log("Summary:");
    console.log(`  Episode: ${episodeId}`);
    console.log(`  Duration: ${envelope.metadata?.duration}s`);
    console.log(`  Words: ${envelope.words.length}`);
    console.log(`  Processing time: ${apiTime}ms`);
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

// Run the test
testTranscription().catch(console.error);
