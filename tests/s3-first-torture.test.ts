/**
 * S3-First Pattern Torture Test
 * Validates that our new stateless implementation handles massive data correctly
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
  persistStepOutput,
  wouldExceedStepLimit,
  minimalStepResult,
} from "../src/lib/safe_step_output";
import { keys } from "../src/lib/keys";
import * as storageSafe from "../src/lib/storage_safe";

// Mock storage
jest.mock("../src/lib/storage_safe");

describe("S3-First Pattern Torture Test", () => {
  const episodeId = "TORTURE_EP_6K_SEGMENTS";

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("6000+ Segments Torture Test", () => {
    it("should handle 6000 diarization segments without step output errors", async () => {
      // Create massive diarization with 6000 segments
      const massiveDiarization = {
        segments: Array(6000)
          .fill(null)
          .map((_, i) => ({
            start: i * 7.2,
            end: i * 7.2 + 7.0,
            speaker: `SPEAKER_${i % 10}`,
          })),
        source: "pyannote_precision2" as const,
      };

      // Verify this would exceed limits if returned directly
      expect(wouldExceedStepLimit(massiveDiarization)).toBe(true);

      // Mock storage save
      const mockSaveJson = jest
        .spyOn(storageSafe, "saveJson")
        .mockResolvedValue();

      // Use safeStepOutput - should save to S3 and return minimal metadata
      const diarizationKey = keys.diarizationRaw(episodeId);
      const result = await persistStepOutput(
        diarizationKey,
        massiveDiarization,
        {
          segments: 6000,
          source: "pyannote_precision2",
        },
      );

      // Verify S3 save was called
      expect(mockSaveJson).toHaveBeenCalledWith(
        diarizationKey,
        massiveDiarization,
      );

      // Verify result is minimal
      expect(result.storage_key).toBe(diarizationKey);
      expect(result.metadata.segments).toBe(6000);
      expect(result.size).toBeGreaterThan(100 * 1024); // Should be > 100KB

      // Verify the returned result itself is small
      const resultSize = Buffer.byteLength(JSON.stringify(result));
      expect(resultSize).toBeLessThan(1024); // Result should be < 1KB
    });

    it("should handle 8000 enriched transcript segments", async () => {
      // Create massive enriched transcript with 8000 segments
      const massiveEnriched = Array(8000)
        .fill(null)
        .map((_, i) => ({
          start: i * 5.4,
          end: i * 5.4 + 5.2,
          text: `This is segment ${i} with some reasonably long text to simulate real speech`,
          speaker: i % 2 === 0 ? "Alex Hormozi" : "Guest Speaker",
          diar_speaker: `SPEAKER_${i % 10}`,
          speaker_confidence: 0.85 + Math.random() * 0.15,
          source: "pyannote_precision2" as const,
        }));

      // Verify this would exceed limits
      expect(wouldExceedStepLimit(massiveEnriched)).toBe(true);

      const mockSaveJson = jest
        .spyOn(storageSafe, "saveJson")
        .mockResolvedValue();

      // Save using safeStepOutput
      const enrichedKey = keys.enriched(episodeId);
      const result = await persistStepOutput(enrichedKey, massiveEnriched, {
        segments: 8000,
        identified: 7200,
      });

      expect(mockSaveJson).toHaveBeenCalledWith(enrichedKey, massiveEnriched);
      expect(result.storage_key).toBe(enrichedKey);
      expect(result.metadata.segments).toBe(8000);

      // Result should be tiny
      const resultSize = Buffer.byteLength(JSON.stringify(result));
      expect(resultSize).toBeLessThan(1024);
    });

    it("should handle complex speaker map with many near-misses", async () => {
      // Create complex speaker map
      const speakerMap = Object.fromEntries(
        Array(100)
          .fill(null)
          .map((_, i) => [
            `SPEAKER_${i}`,
            {
              displayName: `Speaker Name ${i}`,
              confidence: 0.7 + Math.random() * 0.3,
              referenceId: `ref_speaker_${i}`,
            },
          ]),
      );

      // Create many near-misses
      const nearMisses = Array(200)
        .fill(null)
        .map((_, i) => ({
          clusterKey: `SPEAKER_${i % 100}`,
          confidence: 0.65 + Math.random() * 0.1,
          threshold: 0.75,
          referenceId: `ref_speaker_${i % 50}`,
        }));

      const mockSaveJson = jest
        .spyOn(storageSafe, "saveJson")
        .mockResolvedValue();

      // Save both to S3
      const speakerMapKey = keys.speakerMap(episodeId);
      const nearMissesKey = keys.nearMisses(episodeId);

      const mapResult = await persistStepOutput(speakerMapKey, speakerMap);
      const missesResult = await persistStepOutput(nearMissesKey, nearMisses);

      expect(mockSaveJson).toHaveBeenCalledWith(speakerMapKey, speakerMap);
      expect(mockSaveJson).toHaveBeenCalledWith(nearMissesKey, nearMisses);

      // Both results should be minimal
      expect(Buffer.byteLength(JSON.stringify(mapResult))).toBeLessThan(1024);
      expect(Buffer.byteLength(JSON.stringify(missesResult))).toBeLessThan(
        1024,
      );
    });
  });

  describe("Minimal Step Result Pattern", () => {
    it("should create minimal results for all steps", () => {
      // Step 1: Diarization
      const diarizationResult = minimalStepResult(
        episodeId,
        { diarization: keys.diarizationRaw(episodeId) },
        { segments: 6000, source: "pyannote_precision2" },
      );

      expect(diarizationResult.episode_id).toBe(episodeId);
      expect(diarizationResult.keys.diarization).toBe(
        keys.diarizationRaw(episodeId),
      );
      expect(Buffer.byteLength(JSON.stringify(diarizationResult))).toBeLessThan(
        512,
      );

      // Step 2: Speaker identification
      const speakerResult = minimalStepResult(
        episodeId,
        {
          speaker_map: keys.speakerMap(episodeId),
          near_misses: keys.nearMisses(episodeId),
        },
        { identified: 10, near_misses: 47, clusters: 89 },
      );

      expect(speakerResult.keys.speaker_map).toBe(keys.speakerMap(episodeId));
      expect(Buffer.byteLength(JSON.stringify(speakerResult))).toBeLessThan(
        512,
      );

      // Step 3: Enrichment
      const enrichmentResult = minimalStepResult(
        episodeId,
        { enriched: keys.enriched(episodeId) },
        { segments: 8000, identified: 7200, source: "pyannote_precision2" },
      );

      expect(enrichmentResult.keys.enriched).toBe(keys.enriched(episodeId));
      expect(Buffer.byteLength(JSON.stringify(enrichmentResult))).toBeLessThan(
        512,
      );

      // Step 4: Audit
      const auditResult = minimalStepResult(
        episodeId,
        { audit: `diarization/${episodeId}/audit.json` },
        { clusters: 89, total_segments: 6000, source: "pyannote_precision2" },
      );

      expect(auditResult.keys.audit).toContain("audit.json");
      expect(Buffer.byteLength(JSON.stringify(auditResult))).toBeLessThan(512);

      // Final result
      const finalResult = minimalStepResult(
        episodeId,
        {
          enriched: keys.enriched(episodeId),
          audit: `diarization/${episodeId}/audit.json`,
        },
        {
          status: "success",
          processing_time_ms: 450000,
          source: "pyannote_precision2",
          segments: 8000,
          identified: 7200,
        },
      );

      expect(finalResult.episode_id).toBe(episodeId);
      expect(finalResult.stats.status).toBe("success");
      expect(Buffer.byteLength(JSON.stringify(finalResult))).toBeLessThan(512);
    });
  });

  describe("Extreme Edge Cases", () => {
    it("should handle 12-hour episode with 12000 segments", async () => {
      const extremeDiarization = {
        segments: Array(12000)
          .fill(null)
          .map((_, i) => ({
            start: i * 3.6,
            end: i * 3.6 + 3.5,
            speaker: `SPEAKER_${i % 20}`,
          })),
        source: "pyannote_precision2" as const,
      };

      expect(wouldExceedStepLimit(extremeDiarization)).toBe(true);

      const mockSaveJson = jest
        .spyOn(storageSafe, "saveJson")
        .mockResolvedValue();
      const diarizationKey = keys.diarizationRaw("EXTREME_12HR");

      const result = await persistStepOutput(
        diarizationKey,
        extremeDiarization,
      );

      expect(mockSaveJson).toHaveBeenCalled();
      expect(result.storage_key).toBe(diarizationKey);
      expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(1024);
    });

    it("should handle deeply nested audit artifacts", async () => {
      const complexAudit = {
        clusters: Array(100)
          .fill(null)
          .map((_, i) => ({
            speakerKey: `SPEAKER_${i}`,
            duration: 300 + Math.random() * 200,
            segmentsCount: 50 + Math.floor(Math.random() * 100),
            mappedTo: i < 20 ? `Speaker ${i}` : null,
            confidence: i < 20 ? 0.8 + Math.random() * 0.2 : null,
            metadata: {
              pitch_stats: {
                mean: 200 + Math.random() * 50,
                std: 10 + Math.random() * 5,
              },
              energy_profile: Array(10)
                .fill(null)
                .map(() => Math.random()),
            },
          })),
        totalSegments: 12000,
        source: "pyannote_precision2" as const,
        nearMisses: Array(300)
          .fill(null)
          .map((_, i) => ({
            clusterKey: `SPEAKER_${i % 100}`,
            confidence: 0.6 + Math.random() * 0.15,
            threshold: 0.75,
            referenceId: `ref_${i % 50}`,
          })),
        processingMetrics: {
          total_time_ms: 600000,
          api_calls: 250,
          retry_count: 3,
          cache_hits: 180,
        },
        notes: "x".repeat(200_000),
      };

      expect(wouldExceedStepLimit(complexAudit)).toBe(true);

      const mockSaveJson = jest
        .spyOn(storageSafe, "saveJson")
        .mockResolvedValue();
      const auditKey = `diarization/EXTREME_12HR/audit.json`;

      const result = await persistStepOutput(auditKey, complexAudit);

      expect(mockSaveJson).toHaveBeenCalled();
      expect(result.storage_key).toBe(auditKey);
      expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(1024);
    });

    it("should reject data that cannot be serialized", () => {
      const circular: any = { a: 1 };
      circular.self = circular;

      expect(wouldExceedStepLimit(circular)).toBe(true);
    });

    it("should handle Unicode and special characters", async () => {
      const unicodeData = {
        segments: Array(100)
          .fill(null)
          .map((_, i) => ({
            text: `Test 🎉 emoji 🔥 and special chars: "quotes" & symbols < > ${i}`,
            speaker: `Speaker_${i % 5}_ñáéíóú`,
          })),
      };

      const mockSaveJson = jest
        .spyOn(storageSafe, "saveJson")
        .mockResolvedValue();
      const result = await persistStepOutput("unicode-test", unicodeData);

      expect(mockSaveJson).toHaveBeenCalled();
      expect(result.storage_key).toBe("unicode-test");
    });
  });
});
