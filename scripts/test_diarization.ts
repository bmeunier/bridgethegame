#!/usr/bin/env tsx
/**
 * Test script to see Deepgram response with diarization enabled
 */

import * as dotenv from "dotenv";
import { deepgramClient } from "../src/lib/deepgram";

dotenv.config();

async function testDiarization() {
  // Use the same episode we just tested
  const audioUrl =
    "https://mcdn.podbean.com/mf/web/c3i2s8u66e6q90ep/rss_p_episodes_captivate_fm_episode_60597bfb-fd37-40b1-b72e-dbed7fd83b13.mp3";

  console.log("🎭 Testing Deepgram with diarization enabled...");
  console.log('Episode: "Avoiding Bad Partners" (16 min)');
  console.log("---\n");

  try {
    const response = await deepgramClient.transcribeFromUrl(audioUrl, {
      model: "general",
      punctuate: true,
      utterances: true,
      paragraphs: true,
      timestamps: true,
      diarize: true, // Enable diarization
      filler_words: false,
      profanity_filter: false,
      language: "en",
      smart_format: true,
    });

    console.log("✅ Response received");
    console.log(`Duration: ${response.metadata.duration}s`);

    // Check for speaker information in words
    const firstChannelWords =
      response.results.channels[0].alternatives[0].words;
    const wordsWithSpeakers =
      firstChannelWords?.filter((w) => w.speaker !== undefined) || [];

    console.log(
      `\nWords with speaker info: ${wordsWithSpeakers.length}/${firstChannelWords?.length || 0}`,
    );

    if (wordsWithSpeakers.length > 0) {
      console.log("\nFirst 10 words with speakers:");
      wordsWithSpeakers.slice(0, 10).forEach((word, i) => {
        console.log(
          `  ${i + 1}. "${word.word}" [${word.start}-${word.end}s] → Speaker ${word.speaker}`,
        );
      });
    }

    // Check for utterances with speakers
    const utterances = response.results.channels[0].alternatives[0].utterances;
    const utterancesWithSpeakers =
      utterances?.filter((u) => u.speaker !== undefined) || [];

    console.log(
      `\nUtterances with speaker info: ${utterancesWithSpeakers.length}/${utterances?.length || 0}`,
    );

    if (utterancesWithSpeakers.length > 0) {
      console.log("\nFirst 5 utterances with speakers:");
      utterancesWithSpeakers.slice(0, 5).forEach((utterance, i) => {
        const text = utterance.transcript.substring(0, 80);
        console.log(
          `  ${i + 1}. Speaker ${utterance.speaker} [${utterance.start}-${utterance.end}s]: "${text}..."`,
        );
      });
    }

    // Check for top-level utterances (might have speaker info)
    const topLevelUtterances = response.results.utterances;
    if (topLevelUtterances && topLevelUtterances.length > 0) {
      console.log(`\nTop-level utterances: ${topLevelUtterances.length}`);
      const withSpeakers = topLevelUtterances.filter(
        (u) => u.speaker !== undefined,
      );
      console.log(`With speaker info: ${withSpeakers.length}`);

      if (withSpeakers.length > 0) {
        console.log("\nFirst 3 top-level utterances with speakers:");
        withSpeakers.slice(0, 3).forEach((utterance, i) => {
          const text = utterance.transcript.substring(0, 80);
          console.log(
            `  ${i + 1}. Speaker ${utterance.speaker} [${utterance.start}-${utterance.end}s]: "${text}..."`,
          );
        });
      }
    }

    // Check for any other speaker-related fields
    console.log("\n🔍 Raw response structure analysis:");
    console.log("Available top-level fields:", Object.keys(response.results));
    console.log(
      "Channel[0] alternative[0] fields:",
      Object.keys(response.results.channels[0].alternatives[0]),
    );

    // Save response for inspection
    const fs = require("fs");
    const filename = "/tmp/deepgram_diarization_response.json";
    fs.writeFileSync(filename, JSON.stringify(response, null, 2));
    console.log(`\n💾 Full response saved to: ${filename}`);
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

testDiarization();
