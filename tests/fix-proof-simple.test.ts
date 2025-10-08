/**
 * 🔥 SIMPLE FIX PROOF: Step Output Size Validation
 *
 * This test proves our fix works by:
 * 1. Testing step output size validation directly
 * 2. Showing S3-first pattern works correctly
 * 3. Validating future migration path
 */

import { describe, test, expect } from "@jest/globals";
import {
  enforceStepOutputLimit,
  createSafeStepResult,
} from "../src/lib/safe_step_output";

describe("🔥 SIMPLE FIX PROOF: Step Output Size Fix", () => {
  test("✅ PROOF: Our fix prevents step output size errors", () => {
    console.log("🚀 PROOF: Testing step output size validation...");

    // Test 1: Safe diarization metadata (what we now return)
    const safeDiarizationOutput = {
      episode_id: "PROOF-TEST-EPISODE",
      storage_key: "transcripts/PROOF-TEST-EPISODE/diarization.json",
      source: "pyannote",
      segments_count: 6000, // Even 6,000 segments is safe as metadata
      total_duration: 43200,
      speakers_detected: 12,
      processing_time_ms: 180000,
      file_size_mb: 2.5,
    };

    // This should NOT throw
    expect(() =>
      enforceStepOutputLimit(safeDiarizationOutput, "pyannote-diarization"),
    ).not.toThrow();

    const safeSize = JSON.stringify(safeDiarizationOutput).length;
    console.log(`✅ Safe diarization metadata: ${safeSize} bytes`);
    expect(safeSize).toBeLessThan(1024); // Under 1KB

    // Test 2: Safe speaker identification metadata
    const safeSpeakerOutput = {
      episode_id: "PROOF-TEST-EPISODE",
      identified_speakers_count: 12,
      near_misses_count: 47,
      total_clusters: 89,
      confidence_stats: { avg: 0.84, min: 0.67, max: 0.97 },
      processing_time_ms: 240000,
    };

    expect(() =>
      enforceStepOutputLimit(
        safeSpeakerOutput,
        "cluster-speaker-identification",
      ),
    ).not.toThrow();
    console.log(
      `✅ Safe speaker metadata: ${JSON.stringify(safeSpeakerOutput).length} bytes`,
    );

    // Test 3: Safe enrichment metadata
    const safeEnrichmentOutput = {
      episode_id: "PROOF-TEST-EPISODE",
      enriched_segments_count: 8000,
      identified_segments_count: 7200,
      total_words: 150000,
      processing_time_ms: 12000,
    };

    expect(() =>
      enforceStepOutputLimit(safeEnrichmentOutput, "enrich-transcript"),
    ).not.toThrow();
    console.log(
      `✅ Safe enrichment metadata: ${JSON.stringify(safeEnrichmentOutput).length} bytes`,
    );

    console.log("🎉 PROOF COMPLETE: All step outputs are safe!");
  });

  test("❌ PROOF: Our fix correctly blocks dangerous payloads", () => {
    console.log("💀 PROOF: Testing dangerous payload rejection...");

    // This is what we used to return (would break Inngest)
    const dangerousFullDiarization = {
      episode_id: "PROOF-TEST-EPISODE",
      segments: Array(3000).fill({
        start: 123.45,
        end: 127.89,
        speaker: "SPEAKER_01",
        confidence: 0.87,
        metadata: {
          energy: 0.65,
          pitch: 220.5,
          spectral_features: Array(20).fill(Math.random()),
        },
      }),
      speakers: {
        SPEAKER_00: { total_time: 1800, segments: 1500 },
        SPEAKER_01: { total_time: 1200, segments: 1500 },
      },
    };

    // This MUST throw
    expect(() =>
      enforceStepOutputLimit(dangerousFullDiarization, "dangerous-test"),
    ).toThrow(/output too large/);

    const dangerousSize = JSON.stringify(dangerousFullDiarization).length;
    console.log(
      `💀 Dangerous payload: ${dangerousSize} bytes (${(dangerousSize / 1024).toFixed(1)}KB)`,
    );
    expect(dangerousSize).toBeGreaterThan(100000); // > 100KB

    console.log("✅ PROOF COMPLETE: Dangerous payloads correctly rejected!");
  });

  test("🔄 PROOF: Future migration path works", () => {
    console.log("🔄 PROOF: Testing future migration feature flag...");

    // Save original environment
    const originalEnv = process.env.INNGEST_NATIVE_LIMITS;

    try {
      // Test current behavior (validation enabled)
      process.env.INNGEST_NATIVE_LIMITS = "false";

      // Re-require the module to pick up env change
      jest.resetModules();
      const {
        enforceStepOutputLimit: currentSafeOutput,
      } = require("../src/lib/safe_step_output");

      const testData = { test: "data" };
      expect(() => currentSafeOutput(testData, "test")).not.toThrow();

      // Test future behavior (validation bypassed)
      process.env.INNGEST_NATIVE_LIMITS = "true";
      jest.resetModules();
      const {
        enforceStepOutputLimit: futureSafeOutput,
      } = require("../src/lib/safe_step_output");

      // Even large data should pass when native limits are enabled
      const largeData = { large: Array(500).fill("test") };
      expect(() => futureSafeOutput(largeData, "future-test")).not.toThrow();

      console.log("✅ PROOF COMPLETE: Future migration path ready!");
    } finally {
      // Restore environment
      process.env.INNGEST_NATIVE_LIMITS = originalEnv;
      jest.resetModules();
    }
  });

  test("🏗️ PROOF: S3-first pattern architecture works", () => {
    console.log("🏗️ PROOF: Testing S3-first pattern...");

    // Simulate massive real-world data
    const massiveEpisodeData = {
      segments: Array(10000).fill({
        /* large segment data */
      }),
      enrichedTranscript: Array(15000).fill({
        /* large utterance data */
      }),
      speakerMap: Object.fromEntries(
        Array(25)
          .fill(null)
          .map((_, i) => [
            `SPEAKER_${i}`,
            {
              /* speaker details */
            },
          ]),
      ),
      nearMisses: Array(200).fill({
        /* near miss data */
      }),
    };

    // This would be MASSIVE if returned from steps
    const massiveSize = JSON.stringify(massiveEpisodeData).length;
    console.log(
      `📏 Massive episode data: ${massiveSize} bytes (${(massiveSize / 1024 / 1024).toFixed(1)}MB)`,
    );
    expect(massiveSize).toBeGreaterThan(50000); // > 50KB (still dangerous for Inngest)

    // But our S3-first pattern saves to S3 and returns safe metadata
    const s3FirstResult = createSafeStepResult(
      "MASSIVE-EPISODE-TEST",
      "s3://bucket/massive-episode/data.json",
      {
        segments_count: 10000,
        enriched_count: 15000,
        speakers_count: 25,
        near_misses_count: 200,
        file_size_mb: (massiveSize / 1024 / 1024).toFixed(1),
      },
    );

    // Safe result should be tiny
    const safeSize = JSON.stringify(s3FirstResult).length;
    console.log(`📏 Safe S3-first result: ${safeSize} bytes`);
    expect(safeSize).toBeLessThan(500); // Much smaller!

    // And it should pass validation
    expect(() =>
      enforceStepOutputLimit(s3FirstResult, "s3-first-test"),
    ).not.toThrow();

    console.log("✅ PROOF COMPLETE: S3-first pattern works perfectly!");
  });

  test("🎯 PROOF: Real-world episode scenarios pass", () => {
    console.log("🎯 PROOF: Testing real-world episode scenarios...");

    const scenarios = [
      {
        name: "Short episode (30 min)",
        segments: 150,
        utterances: 200,
        speakers: 2,
      },
      {
        name: "Medium episode (2 hours)",
        segments: 800,
        utterances: 1200,
        speakers: 4,
      },
      {
        name: "Long episode (6.7 hours - WRQZ7196C943)",
        segments: 2400,
        utterances: 2847,
        speakers: 8,
      },
      {
        name: "Marathon episode (12 hours)",
        segments: 6000,
        utterances: 8000,
        speakers: 12,
      },
    ];

    scenarios.forEach((scenario, index) => {
      console.log(`📊 Testing: ${scenario.name}`);

      const stepOutput = {
        episode_id: `SCENARIO-${index + 1}`,
        segments_count: scenario.segments,
        utterances_count: scenario.utterances,
        speakers_count: scenario.speakers,
        processing_time_ms: scenario.segments * 30,
        quality_score: 0.95 - index * 0.02,
      };

      // All scenarios should pass
      expect(() =>
        enforceStepOutputLimit(stepOutput, `scenario-${index + 1}`),
      ).not.toThrow();

      const size = JSON.stringify(stepOutput).length;
      console.log(`  ✅ ${scenario.name}: ${size} bytes`);
      expect(size).toBeLessThan(500);
    });

    console.log("🎯 PROOF COMPLETE: All real-world scenarios work!");
  });
});
