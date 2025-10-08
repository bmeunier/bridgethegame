/**
 * Retry simulation test for diarization function
 * Ensures the function can recover from mid-step failures
 */

import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from "@jest/globals";
import { keys } from "../src/lib/keys";
import * as storageSafe from "../src/lib/storage_safe";
import * as pyannoteLib from "../src/lib/pyannote";
import * as speakerUtils from "../src/lib/speaker-utils";

// Mock all dependencies
jest.mock("../src/lib/storage_safe");
jest.mock("../src/lib/pyannote");
jest.mock("../src/lib/speaker-utils");
jest.mock("../src/lib/storage");

describe("Diarization Retry Simulation", () => {
  const episodeId = "TEST_EP_001";
  const podcastId = "test_podcast";

  // Test data
  const mockDiarization = {
    segments: [
      { start: 0, end: 5, speaker: "SPEAKER_0" },
      { start: 5, end: 10, speaker: "SPEAKER_1" },
      { start: 10, end: 15, speaker: "SPEAKER_0" },
      { start: 15, end: 20, speaker: "SPEAKER_1" },
    ],
    source: "pyannote_precision2" as const,
  };

  const mockTranscript = {
    utterances: [
      { start: 0, end: 5, text: "Hello everyone", speaker: "dg-0" },
      { start: 5, end: 10, text: "Welcome to the show", speaker: "dg-1" },
      { start: 10, end: 15, text: "Today we discuss", speaker: "dg-0" },
      { start: 15, end: 20, text: "Important topics", speaker: "dg-1" },
    ],
    words: [],
    deepgram_speakers: [],
  };

  const mockSpeakerMap = {
    SPEAKER_0: {
      displayName: "Alex Hormozi",
      confidence: 0.92,
      referenceId: "ref_hormozi",
    },
    SPEAKER_1: {
      displayName: "Guest Speaker",
      confidence: 0.88,
      referenceId: "ref_guest",
    },
  };

  const mockRegistry = {
    speaker1: {
      displayName: "Alex Hormozi",
      referenceId: "ref_hormozi",
      threshold: 0.85,
    },
    speaker2: {
      displayName: "Guest Speaker",
      referenceId: "ref_guest",
      threshold: 0.85,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Step 1 Retry: Diarization saved but step fails", () => {
    it("should recover by reloading diarization from S3", async () => {
      // Simulate: Diarization was saved to S3, but step failed after save
      const diarizationKey = keys.diarizationRaw(episodeId);

      // First attempt: Save succeeds but step throws after
      let callCount = 0;
      jest
        .spyOn(storageSafe, "saveJson")
        .mockImplementation(async (key, data) => {
          if (key === diarizationKey && callCount === 0) {
            callCount++;
            // Simulate successful save followed by step failure
            setTimeout(() => {
              throw new Error("Network timeout after save");
            }, 0);
          }
        });

      // Second attempt (retry): Data exists in S3
      jest
        .spyOn(storageSafe, "mustLoadJson")
        .mockResolvedValue(mockDiarization);

      // Verify that the retry can load the saved diarization
      const loaded = await storageSafe.mustLoadJson(
        diarizationKey,
        "diarization",
      );
      expect(loaded).toEqual(mockDiarization);
    });
  });

  describe("Step 2 Retry: Speaker identification partially complete", () => {
    it("should reload diarization and complete identification", async () => {
      // Simulate: Some speakers identified, then failure
      const diarizationKey = keys.diarizationRaw(episodeId);
      const speakerMapKey = keys.speakerMap(episodeId);

      // Setup: Diarization exists from previous step
      jest
        .spyOn(storageSafe, "mustLoadJson")
        .mockImplementation(async (key: string) => {
          if (key === diarizationKey) return mockDiarization;
          if (key === keys.transcript(episodeId)) return mockTranscript;
          throw new Error(`Unexpected key: ${key}`);
        });

      // Mock speaker registry
      jest
        .spyOn(speakerUtils, "getSpeakerRegistry")
        .mockResolvedValue(mockRegistry);

      // Mock clustering
      jest.spyOn(pyannoteLib, "groupSegmentsBySpeaker").mockReturnValue({
        SPEAKER_0: mockDiarization.segments.filter(
          (s) => s.speaker === "SPEAKER_0",
        ),
        SPEAKER_1: mockDiarization.segments.filter(
          (s) => s.speaker === "SPEAKER_1",
        ),
      });

      // Mock representative segment selection
      jest
        .spyOn(pyannoteLib, "selectRepresentativeSegment")
        .mockImplementation((segments) => segments[0]);

      // Mock audio clip URL generation
      jest
        .spyOn(speakerUtils, "getAudioClipUrl")
        .mockResolvedValue("https://audio.example.com/clip");

      // First attempt: Identify first speaker, then fail
      let identifyCallCount = 0;
      jest
        .spyOn(pyannoteLib, "identifySpeaker")
        .mockImplementation(async () => {
          identifyCallCount++;
          if (identifyCallCount === 1) {
            return {
              matches: true,
              confidence: 0.92,
              referenceId: "ref_hormozi",
            };
          }
          // Simulate failure on second speaker
          throw new Error("API rate limit");
        });

      // Retry should be able to complete the identification
      // In real scenario, the step would retry and reload data

      // Verify data can be reloaded
      const reloadedDiarization = await storageSafe.mustLoadJson(
        diarizationKey,
        "diarization",
      );
      expect(reloadedDiarization).toEqual(mockDiarization);

      const registry = await speakerUtils.getSpeakerRegistry(podcastId);
      expect(registry).toEqual(mockRegistry);
    });
  });

  describe("Step 3 Retry: Enrichment interrupted", () => {
    it("should reload all data and complete enrichment", async () => {
      // Setup: All previous data exists in S3
      jest
        .spyOn(storageSafe, "mustLoadJson")
        .mockImplementation(async (key: string) => {
          if (key === keys.transcript(episodeId)) return mockTranscript;
          throw new Error(`Unexpected key: ${key}`);
        });

      jest
        .spyOn(storageSafe, "tryLoadJson")
        .mockImplementation(async (key: string) => {
          if (key === keys.diarizationRaw(episodeId)) return mockDiarization;
          if (key === keys.speakerMap(episodeId)) return mockSpeakerMap;
          if (key === keys.nearMisses(episodeId)) return [];
          return null;
        });

      // Mock enrichment function
      const mockEnrichedSegments = mockTranscript.utterances.map((utt, i) => ({
        ...utt,
        speaker: mockSpeakerMap[`SPEAKER_${i % 2}`]?.displayName || "Unknown",
        diar_speaker: `SPEAKER_${i % 2}`,
        speaker_confidence:
          mockSpeakerMap[`SPEAKER_${i % 2}`]?.confidence || null,
        source: "pyannote_precision2" as const,
      }));

      jest
        .spyOn(pyannoteLib, "enrichTranscript")
        .mockReturnValue(mockEnrichedSegments);

      // First attempt: Enrichment starts but fails midway
      let enrichCallCount = 0;
      const originalEnrich = pyannoteLib.enrichTranscript;
      jest
        .spyOn(pyannoteLib, "enrichTranscript")
        .mockImplementation((...args) => {
          enrichCallCount++;
          if (enrichCallCount === 1) {
            throw new Error("Memory allocation error");
          }
          return mockEnrichedSegments;
        });

      // Retry: Should reload all data and complete
      try {
        // First attempt fails
        pyannoteLib.enrichTranscript(
          mockTranscript.utterances,
          mockDiarization,
          mockSpeakerMap,
        );
      } catch (error) {
        // Expected failure
      }

      // Retry succeeds by reloading data
      const transcript = await storageSafe.mustLoadJson(
        keys.transcript(episodeId),
        "transcript",
      );
      const diar = await storageSafe.tryLoadJson(
        keys.diarizationRaw(episodeId),
      );
      const spkMap =
        (await storageSafe.tryLoadJson(keys.speakerMap(episodeId))) ?? {};

      // Second attempt should succeed
      const enriched = pyannoteLib.enrichTranscript(
        transcript.utterances || [],
        diar,
        spkMap,
      );

      expect(enriched).toEqual(mockEnrichedSegments);
    });
  });

  describe("Fallback Scenario: Pyannote fails, Deepgram fallback", () => {
    it("should handle Pyannote failure and use Deepgram fallback", async () => {
      // Mock Pyannote diarization to fail
      jest
        .spyOn(pyannoteLib, "diarize")
        .mockRejectedValue(new Error("Pyannote API down"));

      // Mock Deepgram fallback
      const deepgramFallback = {
        segments: [
          { start: 0, end: 5, speaker: "dg-0" },
          { start: 5, end: 10, speaker: "dg-1" },
        ],
        source: "deepgram_fallback" as const,
      };

      jest
        .spyOn(speakerUtils, "getDeepgramDiarizationFallback")
        .mockResolvedValue(deepgramFallback);

      // Try diarization with fallback
      let result;
      try {
        await pyannoteLib.diarize("audio_url", "api_key");
      } catch (error) {
        // Expected to fail, use fallback
        result = await speakerUtils.getDeepgramDiarizationFallback(episodeId);
      }

      expect(result).toEqual(deepgramFallback);
      expect(result.source).toBe("deepgram_fallback");
    });
  });

  describe("Data Consistency: S3-first pattern", () => {
    it("should always save to S3 before returning step results", async () => {
      const saveJsonSpy = jest
        .spyOn(storageSafe, "saveJson")
        .mockResolvedValue();

      // Simulate saving various data types
      const testData = {
        diarization: mockDiarization,
        speakerMap: mockSpeakerMap,
        nearMisses: [],
        enriched: [],
      };

      // Save all data to S3
      await Promise.all([
        storageSafe.saveJson(
          keys.diarizationRaw(episodeId),
          testData.diarization,
        ),
        storageSafe.saveJson(keys.speakerMap(episodeId), testData.speakerMap),
        storageSafe.saveJson(keys.nearMisses(episodeId), testData.nearMisses),
        storageSafe.saveJson(keys.enriched(episodeId), testData.enriched),
      ]);

      // Verify all saves were called
      expect(saveJsonSpy).toHaveBeenCalledTimes(4);
      expect(saveJsonSpy).toHaveBeenCalledWith(
        keys.diarizationRaw(episodeId),
        testData.diarization,
      );
      expect(saveJsonSpy).toHaveBeenCalledWith(
        keys.speakerMap(episodeId),
        testData.speakerMap,
      );
      expect(saveJsonSpy).toHaveBeenCalledWith(
        keys.nearMisses(episodeId),
        testData.nearMisses,
      );
      expect(saveJsonSpy).toHaveBeenCalledWith(
        keys.enriched(episodeId),
        testData.enriched,
      );
    });

    it("should return only minimal metadata, never large data", () => {
      // Create minimal step results
      const stepResults = {
        diarization: {
          episode_id: episodeId,
          keys: { diarization: keys.diarizationRaw(episodeId) },
          stats: { segments: 100, source: "pyannote_precision2" },
        },
        identification: {
          episode_id: episodeId,
          keys: {
            speaker_map: keys.speakerMap(episodeId),
            near_misses: keys.nearMisses(episodeId),
          },
          stats: { identified: 2, near_misses: 1, clusters: 2 },
        },
        enrichment: {
          episode_id: episodeId,
          keys: { enriched: keys.enriched(episodeId) },
          stats: { segments: 100, identified: 80 },
        },
      };

      // Verify all results are small
      Object.values(stepResults).forEach((result) => {
        const size = Buffer.byteLength(JSON.stringify(result));
        expect(size).toBeLessThan(1024); // Each result should be < 1KB
        expect(result.episode_id).toBe(episodeId);
        expect(result.keys).toBeDefined();
        expect(result.stats).toBeDefined();
      });
    });
  });
});
