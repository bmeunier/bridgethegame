#!/usr/bin/env tsx
/**
 * Debug script to test Deepgram diarization parameters
 */

import * as dotenv from "dotenv";
import { deepgramClient } from "../src/lib/deepgram";

dotenv.config();

async function debugDiarization() {
  console.log("🔍 Debugging Deepgram Diarization Parameters");
  console.log("=============================================\n");

  const audioUrl =
    "https://mcdn.podbean.com/mf/web/c3i2s8u66e6q90ep/rss_p_episodes_captivate_fm_episode_60597bfb-fd37-40b1-b72e-dbed7fd83b13.mp3";

  try {
    console.log("1️⃣ Testing with diarize: true...");

    const response = await deepgramClient.transcribeFromUrl(audioUrl, {
      model: "general",
      punctuate: true,
      utterances: true,
      timestamps: true,
      diarize: true, // Explicitly enable diarization
      filler_words: false,
      profanity_filter: false,
      language: "en",
    });

    console.log("\n📊 Response Analysis:");
    console.log("=====================");

    // Check metadata
    console.log("Request ID:", response.metadata.request_id);
    console.log("Duration:", response.metadata.duration);

    // Check for diarization in words
    const words =
      response.results?.channels?.[0]?.alternatives?.[0]?.words || [];
    const hasSpeakerInWords = words.some((w: any) => "speaker" in w);
    console.log(
      `Words with speaker field: ${hasSpeakerInWords ? "YES" : "NO"}`,
    );

    if (hasSpeakerInWords && words.length > 0) {
      const firstWordWithSpeaker = words.find((w: any) => "speaker" in w);
      console.log("Sample word speaker:", firstWordWithSpeaker?.speaker);
    }

    // Check for diarization in utterances
    const utterances = response.results?.utterances || [];
    const hasSpeakerInUtterances = utterances.some((u: any) => "speaker" in u);
    console.log(
      `Utterances with speaker field: ${hasSpeakerInUtterances ? "YES" : "NO"}`,
    );

    if (hasSpeakerInUtterances && utterances.length > 0) {
      const firstUtteranceWithSpeaker = utterances.find(
        (u: any) => "speaker" in u,
      );
      console.log(
        "Sample utterance speaker:",
        firstUtteranceWithSpeaker?.speaker,
      );
    }

    console.log(`\nTotal words: ${words.length}`);
    console.log(`Total utterances: ${utterances.length}`);

    // Test parsing
    console.log("\n2️⃣ Testing parseResponse...");
    const envelope = deepgramClient.parseResponse("DEBUG-TEST", response);

    console.log(`Parsed words: ${envelope.words.length}`);
    console.log(`Parsed utterances: ${envelope.utterances.length}`);
    console.log(
      `Has deepgram_speakers: ${envelope.deepgram_speakers ? "YES" : "NO"}`,
    );

    if (envelope.deepgram_speakers) {
      console.log(`Sidecar segments: ${envelope.deepgram_speakers.length}`);
      if (envelope.deepgram_speakers.length > 0) {
        console.log("Sample segment:", envelope.deepgram_speakers[0]);
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

debugDiarization();
