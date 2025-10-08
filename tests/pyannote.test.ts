import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import {
  diarize,
  identifySpeaker,
  enrichTranscript,
  groupSegmentsBySpeaker,
  selectRepresentativeSegment,
} from "../src/lib/pyannote";
import { getStorageClient } from "../src/lib/storage";
import { PyannoteSegment } from "../src/types/pyannote";
import { NormalizedUtterance } from "../src/types/deepgram";

jest.mock("../src/lib/storage", () => {
  const mockStorage = {
    loadJson: jest.fn(),
  };
  return {
    getStorageClient: () => mockStorage,
    StorageClient: {
      getTranscriptKey: jest.fn(
        (episodeId: string, type: string) =>
          `transcripts/${episodeId}/${type}.json`,
      ),
    },
  };
});

const mockStorageClient = getStorageClient() as unknown as {
  loadJson: jest.Mock;
};

const mockFetch = jest.fn();
(global as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;

describe("pyannote library", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    mockStorageClient.loadJson.mockReset();
  });

  describe("diarize", () => {
    it("sends POST request with options and returns segments", async () => {
      const segments = [
        { start: 0, end: 2.5, speaker: "SPEAKER_0" },
        { start: 2.5, end: 5, speaker: "SPEAKER_1" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ segments }),
      } as Response);

      const result = await diarize(
        "https://example.com/audio.mp3",
        "test-api-key",
        {
          maxSpeakers: 4,
          minDuration: 0.5,
          doOverlap: false,
        },
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.pyannote.ai/v1/diarize",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer test-api-key",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: "https://example.com/audio.mp3",
            max_speakers: 4,
            min_duration: 0.5,
            do_overlap: false,
          }),
        },
      );

      expect(result).toEqual({ segments, source: "pyannote" });
    });

    it("throws descriptive error when request fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      } as Response);

      await expect(
        diarize("https://example.com/audio.mp3", "bad-api-key"),
      ).rejects.toThrow("Diarization failed: 401 Unauthorized");
    });
  });

  describe("identifySpeaker", () => {
    beforeEach(() => {
      mockStorageClient.loadJson.mockResolvedValue({
        referenceId: "ref_hormozi_123",
        speakerName: "Alex Hormozi",
        voiceprint: "base64voiceprint",
        model: "precision-2",
      });
    });

    it("polls identify job until success and returns confidence", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jobId: "job-123" }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            status: "done",
            result: { matches: true, confidence: 0.91 },
          }),
        } as Response);

      const result = await identifySpeaker(
        "https://example.com/clip.mp3",
        "test-api-key",
        "ref_hormozi_123",
      );

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        "https://api.pyannote.ai/v1/identify",
        expect.any(Object),
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        "https://api.pyannote.ai/v1/jobs/job-123",
        expect.any(Object),
      );
      expect(result).toEqual({
        matches: true,
        confidence: 0.91,
        referenceId: "ref_hormozi_123",
      });
    });

    it("returns false match when confidence low", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jobId: "job-456" }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            status: "done",
            result: { matches: false, confidence: 0.42 },
          }),
        } as Response);

      const result = await identifySpeaker(
        "https://example.com/clip.mp3",
        "test-api-key",
        "ref_hormozi_123",
      );

      expect(result).toEqual({
        matches: false,
        confidence: 0.42,
        referenceId: "ref_hormozi_123",
      });
    });
  });

  describe("enrichTranscript", () => {
    it("aligns utterances with diarization using IoU", () => {
      const transcript: NormalizedUtterance[] = [
        { start: 0, end: 2, text: "Hello there", words: [0, 1], speaker: null },
        {
          start: 2,
          end: 4,
          text: "General Kenobi",
          words: [2, 3],
          speaker: null,
        },
      ];

      const diarization = {
        segments: [
          { start: 0, end: 2.5, speaker: "SPEAKER_0" },
          { start: 2.5, end: 4.5, speaker: "SPEAKER_1" },
        ],
        source: "pyannote" as const,
      };

      const speakerMap = {
        SPEAKER_0: {
          displayName: "Alex",
          confidence: 0.9,
          referenceId: "ref1",
        },
        SPEAKER_1: {
          displayName: "Guest",
          confidence: 0.8,
          referenceId: "ref2",
        },
      };

      const result = enrichTranscript(transcript, diarization, speakerMap);

      expect(result).toEqual([
        {
          start: 0,
          end: 2,
          text: "Hello there",
          speaker: "Alex",
          diar_speaker: "SPEAKER_0",
          speaker_confidence: 0.9,
          source: "pyannote",
        },
        {
          start: 2,
          end: 4,
          text: "General Kenobi",
          speaker: "Guest",
          diar_speaker: "SPEAKER_1",
          speaker_confidence: 0.8,
          source: "pyannote",
        },
      ]);
    });
  });

  describe("groupSegmentsBySpeaker", () => {
    it("groups segments by speaker key", () => {
      const segments: PyannoteSegment[] = [
        { start: 0, end: 1, speaker: "A" },
        { start: 1, end: 2, speaker: "B" },
        { start: 2, end: 3, speaker: "A" },
      ];

      const groups = groupSegmentsBySpeaker(segments);

      expect(groups).toEqual({
        A: [segments[0], segments[2]],
        B: [segments[1]],
      });
    });
  });

  describe("selectRepresentativeSegment", () => {
    it("selects the longest middle segment for stability", () => {
      const segments: PyannoteSegment[] = [
        { start: 0, end: 1, speaker: "A" },
        { start: 1, end: 4, speaker: "A" },
        { start: 4, end: 5, speaker: "A" },
      ];

      const representative = selectRepresentativeSegment(segments);
      expect(representative).toEqual(segments[0]);
    });
  });
});
