#!/usr/bin/env npx tsx

/**
 * Debug script to diagnose empty enriched.json issue
 * Loads and validates all pipeline data for episode WRQZ7196C943
 */

import "dotenv/config";
import { getStorageClient } from "../src/lib/storage";
import { keys } from "../src/lib/keys";
import { SpeakerMap, PyannoteDiarizationResponse } from "../src/types/pyannote";
import { TranscriptEnvelope } from "../src/types/deepgram";

const episodeId = "WRQZ7196C943";
const transcriptKey = "transcripts/WRQZ7196C943/deepgram.json";

async function debugEnrichmentPipeline() {
  console.log("🔍 Debugging Enrichment Pipeline for episode:", episodeId);
  console.log("=".repeat(60));

  const storage = getStorageClient();

  try {
    // 1. Check transcript data
    console.log("\n📄 1. Checking Transcript Data...");
    const transcript =
      await storage.loadJson<TranscriptEnvelope>(transcriptKey);

    console.log(`✅ Transcript loaded successfully`);
    console.log(`   Words: ${transcript.words?.length || 0}`);
    console.log(`   Utterances: ${transcript.utterances?.length || 0}`);
    console.log(`   Duration: ${transcript.metadata?.duration || 0}s`);

    if (!transcript.utterances || transcript.utterances.length === 0) {
      console.error("❌ CRITICAL: No utterances found in transcript!");
      console.log("   Transcript structure:", Object.keys(transcript));

      // Check if words exist but utterances don't
      if (transcript.words && transcript.words.length > 0) {
        console.log("   📝 Words are available, utterances might be missing");
        console.log(
          "   First few words:",
          transcript.words.slice(0, 5).map((w: any) => w.word || w.text),
        );
      }
    } else {
      console.log(`   ✅ First utterance: "${transcript.utterances[0].text}"`);
      console.log(
        `   ✅ Last utterance: "${transcript.utterances[transcript.utterances.length - 1].text}"`,
      );
    }

    // 2. Check diarization data
    console.log("\n🎤 2. Checking Diarization Data...");
    const diarizationKey = keys.diarizationRaw(episodeId);
    const diarization =
      await storage.loadJson<PyannoteDiarizationResponse>(diarizationKey);

    console.log(`✅ Diarization loaded successfully`);
    console.log(`   Source: ${diarization.source}`);
    console.log(`   Segments: ${diarization.segments?.length || 0}`);

    if (diarization.segments && diarization.segments.length > 0) {
      const speakers = [...new Set(diarization.segments.map((s) => s.speaker))];
      console.log(`   Speakers: ${speakers.join(", ")}`);
      console.log(
        `   First segment: ${diarization.segments[0].start}s-${diarization.segments[0].end}s (${diarization.segments[0].speaker})`,
      );
    }

    // 3. Check speaker mapping
    console.log("\n👥 3. Checking Speaker Mapping...");
    const speakerMapKey = keys.speakerMap(episodeId);
    try {
      const speakerMap = await storage.loadJson<SpeakerMap>(speakerMapKey);
      console.log(`✅ Speaker map loaded successfully`);
      console.log(`   Mapped speakers: ${Object.keys(speakerMap).length}`);

      for (const [cluster, info] of Object.entries(speakerMap)) {
        console.log(
          `   ${cluster} → ${info.displayName} (confidence: ${info.confidence})`,
        );
      }
    } catch (error) {
      console.log(`⚠️  Speaker map not found or empty`);
    }

    // 4. Check enriched output
    console.log("\n✨ 4. Checking Enriched Output...");
    const enrichedKey = keys.enriched(episodeId);
    try {
      const enriched = await storage.loadJson<any>(enrichedKey);
      console.log(`✅ Enriched file exists`);
      console.log(
        `   Enriched segments: ${Array.isArray(enriched) ? enriched.length : "NOT AN ARRAY"}`,
      );

      if (Array.isArray(enriched) && enriched.length === 0) {
        console.error("❌ CRITICAL: Enriched file is empty array!");
      } else if (!Array.isArray(enriched)) {
        console.error("❌ CRITICAL: Enriched file is not an array!");
        console.log("   Type:", typeof enriched);
        console.log("   Content:", enriched);
      }
    } catch (error) {
      console.error(
        `❌ Failed to load enriched file:`,
        error instanceof Error ? error.message : String(error),
      );
    }

    // 5. Diagnostic Summary
    console.log("\n📊 5. Diagnostic Summary");
    console.log("=".repeat(40));

    const hasUtterances =
      transcript.utterances && transcript.utterances.length > 0;
    const hasSegments = diarization.segments && diarization.segments.length > 0;

    if (!hasUtterances && !hasSegments) {
      console.error(
        "❌ DOUBLE FAILURE: No utterances AND no diarization segments",
      );
    } else if (!hasUtterances) {
      console.error(
        "❌ ROOT CAUSE: No utterances in transcript → enrichment gets empty input",
      );
      console.log(
        "   💡 FIX: Check transcript processing or use words instead of utterances",
      );
    } else if (!hasSegments) {
      console.error(
        "❌ ROOT CAUSE: No diarization segments → no speaker mapping possible",
      );
      console.log("   💡 FIX: Fix diarization API or improve fallback logic");
    } else {
      console.log(
        "✅ Both utterances and segments exist → enrichment should work",
      );
      console.log(
        "   💡 CHECK: Possible timing/alignment issue or enrichment logic bug",
      );
    }

    // 6. Fail fast check
    if (!hasUtterances) {
      throw new Error(
        "ENRICHMENT FAILURE: Cannot enrich transcript with 0 utterances",
      );
    }

    console.log("\n🎉 Diagnostic completed successfully!");
  } catch (error) {
    console.error(
      "\n💥 Diagnostic failed:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

// Run diagnostic
debugEnrichmentPipeline().catch(console.error);
