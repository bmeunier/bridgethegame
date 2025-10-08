/**
 * Unit test to validate Inngest step output size limits
 * Tests the safeStepOutput helper with large data scenarios
 */

import { describe, test, expect } from "@jest/globals";
import {
  enforceStepOutputLimit,
  createSafeStepResult,
} from "../src/lib/safe_step_output";

describe("Inngest Step Output Size Enforcement", () => {
  test("safeStepOutput allows small data under 4KB limit", () => {
    const smallData = {
      episode_id: "test-123",
      segments_count: 100,
      processing_time_ms: 5000,
    };

    expect(() => enforceStepOutputLimit(smallData, "test-step")).not.toThrow();
  });

  test("safeStepOutput throws error for large data over 4KB limit", () => {
    // Create a large object that exceeds 4KB
    const largeData = {
      episode_id: "test-123",
      massive_array: Array(1000).fill({
        speaker: "SPEAKER_01",
        start: 123.456,
        end: 125.789,
        text: "This is a very long piece of transcript text that will be repeated many times to exceed the size limit",
        confidence: 0.95,
        additional_metadata: {
          tags: ["important", "meeting", "discussion"],
          sentiment: "positive",
          entities: ["John Doe", "Company XYZ", "Project Alpha"],
        },
      }),
    };

    expect(() => enforceStepOutputLimit(largeData, "test-large-step")).toThrow(
      /Step "test-large-step" output too large/,
    );
  });

  test("createSafeStepResult generates valid S3-first metadata", () => {
    const result = createSafeStepResult("episode-123", "s3://bucket/key.json", {
      segments_count: 1000,
      processing_time_ms: 15000,
      source: "pyannote",
    });

    expect(result).toEqual({
      episode_id: "episode-123",
      storage_key: "s3://bucket/key.json",
      segments_count: 1000,
      processing_time_ms: 15000,
      source: "pyannote",
    });

    // Should not throw size error
    expect(() =>
      enforceStepOutputLimit(result, "test-safe-result"),
    ).not.toThrow();
  });

  test("validates diarization step output with 1,000 segments stays under limit", () => {
    // Simulate a large diarization result metadata (what we return from step.run)
    const diarizationMetadata = {
      episode_id: "stress-test-episode",
      storage_key: "transcripts/stress-test-episode/diarization.json",
      source: "pyannote",
      segments_count: 1000,
      total_duration: 24000.5, // 6.7 hours in seconds
      speakers_detected: ["SPEAKER_00", "SPEAKER_01", "SPEAKER_02"],
      processing_time_ms: 45000,
    };

    // This should NOT throw - we only return metadata, not the full segments
    expect(() =>
      enforceStepOutputLimit(diarizationMetadata, "pyannote-diarization"),
    ).not.toThrow();

    // Verify the size is reasonable
    const serialized = JSON.stringify(diarizationMetadata);
    const sizeBytes = new TextEncoder().encode(serialized).length;
    expect(sizeBytes).toBeLessThan(1024); // Should be well under 1KB
  });

  test("validates speaker identification step output with many speakers stays under limit", () => {
    // Simulate speaker identification metadata for many speakers
    const speakerIdentificationMetadata = {
      episode_id: "stress-test-episode",
      identified_speakers_count: 15,
      near_misses_count: 8,
      total_clusters: 23,
      confidence_stats: {
        avg_confidence: 0.82,
        min_confidence: 0.65,
        max_confidence: 0.97,
      },
      processing_time_ms: 120000,
    };

    // This should NOT throw
    expect(() =>
      enforceStepOutputLimit(
        speakerIdentificationMetadata,
        "cluster-speaker-identification",
      ),
    ).not.toThrow();
  });

  test("validates enrichment step output with large transcript stays under limit", () => {
    // Simulate enrichment metadata for a large transcript
    const enrichmentMetadata = {
      episode_id: "stress-test-episode",
      enriched_segments_count: 2847, // Many utterances for 6.7 hour episode
      identified_segments_count: 2134, // Most segments have identified speakers
      total_words: 45672,
      speaker_distribution: {
        SPEAKER_00: 1123,
        SPEAKER_01: 1011,
        unknown: 713,
      },
      processing_time_ms: 3500,
    };

    // This should NOT throw - we only return counts and stats, not the full transcript
    expect(() =>
      enforceStepOutputLimit(enrichmentMetadata, "enrich-transcript"),
    ).not.toThrow();
  });

  test("validates final function return for stress test episode stays under limit", () => {
    // Simulate the final return value for a complex, long episode
    const finalResult = {
      status: "success",
      episode_id: "stress-test-WRQZ7196C943",
      diarization_source: "pyannote",
      identified_speakers: 3,
      near_misses_count: 5,
      enriched_segments_count: 2847,
      processing_time_ms: 180000, // 3 minutes total processing
      s3_enriched_path: "transcripts/stress-test-WRQZ7196C943/enriched.json",
      s3_audit_path: "transcripts/stress-test-WRQZ7196C943/pyannote_audit.json",
    };

    // This should NOT throw - final return contains only metadata and S3 paths
    expect(() =>
      enforceStepOutputLimit(finalResult, "diarize-episode-final-return"),
    ).not.toThrow();

    // Verify size is very reasonable
    const serialized = JSON.stringify(finalResult);
    const sizeBytes = new TextEncoder().encode(serialized).length;
    expect(sizeBytes).toBeLessThan(500); // Should be well under 500 bytes
  });

  test("demonstrates what would fail: returning full diarization data from step", () => {
    // This simulates what we were doing BEFORE the fix - returning large objects
    const fullDiarizationData = {
      episode_id: "test-episode",
      segments: Array(1000).fill({
        start: 123.456,
        end: 125.789,
        speaker: "SPEAKER_01",
        confidence: 0.95,
      }),
      speakers: ["SPEAKER_00", "SPEAKER_01", "SPEAKER_02"],
    };

    // This SHOULD throw - demonstrates why we needed the fix
    expect(() =>
      enforceStepOutputLimit(fullDiarizationData, "bad-diarization-step"),
    ).toThrow(/output too large/);
  });
});
