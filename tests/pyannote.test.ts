/**
 * Unit tests for pyannote utilities
 */

import {
  diarize,
  identifySpeaker,
  enrichTranscript,
  groupSegmentsBySpeaker,
  selectRepresentativeSegment,
} from '../src/lib/pyannote';
import {
  getSpeakerRegistry,
  getAudioClipUrl,
  getDeepgramDiarizationFallback,
} from '../src/lib/speaker-utils';

// Mock the storage module
jest.mock('../src/lib/storage', () => ({
  getStorageClient: jest.fn(() => ({
    exists: jest.fn(),
    loadJson: jest.fn(),
  })),
  StorageClient: {
    getTranscriptKey: jest.fn((episodeId: string, type: string) =>
      `transcripts/${episodeId}/${type}.json`
    ),
  },
}));
import {
  transcriptBasic,
  transcriptUtterances,
  transcriptComplex,
  diarizationAligned,
  diarizationEmpty,
  diarizationOverlapping,
  diarizationComplex,
  diarizationFallback,
  speakerRegistryBasic,
  speakerMapBasic,
  mockDiarizationApiResponse,
  mockSpeakerIdentificationSuccessResponse,
  mockSpeakerIdentificationFailResponse,
  mockFetchSuccess,
  mockFetchError,
  createMockFetch,
  nearMissCase,
} from './pyannote.fixtures';

// Mock fetch globally
global.fetch = jest.fn();

describe('pyannote utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('diarize', () => {
    it('should successfully call diarization API', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce(
        mockFetchSuccess(mockDiarizationApiResponse)
      );

      const result = await diarize('https://example.com/audio.mp3', 'test-api-key', 2);

      expect(fetch).toHaveBeenCalledWith('https://api.pyannote.ai/v1/diarize', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audio_url: 'https://example.com/audio.mp3',
          max_speakers: 2,
        }),
      });

      expect(result).toEqual({
        segments: mockDiarizationApiResponse.segments,
        source: 'pyannote',
      });
    });

    it('should handle API errors gracefully', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce(
        mockFetchError(401, 'Unauthorized')
      );

      await expect(
        diarize('https://example.com/audio.mp3', 'invalid-key')
      ).rejects.toThrow('Diarization failed: 401 Unauthorized');

      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should use default max_speakers when not provided', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce(
        mockFetchSuccess(mockDiarizationApiResponse)
      );

      await diarize('https://example.com/audio.mp3', 'test-api-key');

      const callArgs = (fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);
      expect(requestBody.max_speakers).toBe(3);
    });
  });

  describe('identifySpeaker', () => {
    it('should return detailed match info for successful identification', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce(
        mockFetchSuccess(mockSpeakerIdentificationSuccessResponse)
      );

      const result = await identifySpeaker(
        'https://example.com/clip.mp3',
        'test-api-key',
        'ref_hormozi_123'
      );

      expect(fetch).toHaveBeenCalledWith('https://api.pyannote.ai/v1/identify', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audio_url: 'https://example.com/clip.mp3',
          reference_id: 'ref_hormozi_123',
        }),
      });

      expect(result).toEqual({
        matches: true,
        confidence: 0.92,
        referenceId: 'ref_hormozi_123',
      });
    });

    it('should return false for non-matching speaker', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce(
        mockFetchSuccess(mockSpeakerIdentificationFailResponse)
      );

      const result = await identifySpeaker(
        'https://example.com/clip.mp3',
        'test-api-key',
        'ref_hormozi_123'
      );

      expect(result).toEqual({
        matches: false,
        confidence: 0.45,
        referenceId: 'ref_hormozi_123',
      });
    });

    it('should handle identification API errors', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce(
        mockFetchError(429, 'Rate limit exceeded')
      );

      await expect(
        identifySpeaker('https://example.com/clip.mp3', 'test-api-key', 'ref_123')
      ).rejects.toThrow('Speaker identification failed: 429 Rate limit exceeded');
    });
  });

  describe('enrichTranscript', () => {
    it('should align transcript with diarization using IoU', () => {
      const enriched = enrichTranscript(transcriptBasic, diarizationAligned, speakerMapBasic);

      expect(enriched).toHaveLength(2);
      expect(enriched[0]).toMatchObject({
        start: 0.0,
        end: 2.0,
        text: 'Hello',
        speaker: 'Alex Hormozi',
        diar_speaker: 'SPEAKER_0',
        speaker_confidence: 0.92,
        source: 'pyannote',
      });
      expect(enriched[1]).toMatchObject({
        start: 2.0,
        end: 4.0,
        text: 'World',
        speaker: 'Guest_1',
        diar_speaker: 'SPEAKER_1',
        speaker_confidence: 0.87,
        source: 'pyannote',
      });
    });

    it('should handle utterances correctly', () => {
      const enriched = enrichTranscript(transcriptUtterances, diarizationAligned, speakerMapBasic);

      expect(enriched).toHaveLength(2);
      expect(enriched[0].text).toBe('Hello');
      expect(enriched[1].text).toBe('World');
    });

    it('should label Unknown when diarization is empty', () => {
      const enriched = enrichTranscript(transcriptBasic, diarizationEmpty);

      expect(enriched).toHaveLength(2);
      expect(enriched.every(e => e.speaker === 'Unknown')).toBe(true);
      expect(enriched.every(e => e.diar_speaker === 'Unknown')).toBe(true);
      expect(enriched.every(e => e.speaker_confidence === null)).toBe(true);
    });

    it('should handle overlapping segments with IoU', () => {
      const enriched = enrichTranscript(transcriptBasic, diarizationOverlapping);

      expect(enriched).toHaveLength(2);
      // First segment (0-2) should match best with SPEAKER_0 (0.5-1.5) or SPEAKER_1 (1.0-3.0)
      // Second segment (2-4) should match best with SPEAKER_1 (1.0-3.0) or SPEAKER_0 (2.5-4.5)
      expect(enriched[0].diar_speaker).toBeDefined();
      expect(enriched[1].diar_speaker).toBeDefined();
    });

    it('should preserve source information', () => {
      const enriched = enrichTranscript(transcriptBasic, diarizationFallback);

      expect(enriched.every(e => e.source === 'deepgram_fallback')).toBe(true);
    });
  });

  describe('groupSegmentsBySpeaker', () => {
    it('should group segments by speaker key', () => {
      const clusters = groupSegmentsBySpeaker(diarizationAligned.segments);

      expect(Object.keys(clusters)).toHaveLength(2);
      expect(clusters['SPEAKER_0']).toHaveLength(1);
      expect(clusters['SPEAKER_1']).toHaveLength(1);
      expect(clusters['SPEAKER_0'][0]).toEqual({
        start: 0.0,
        end: 2.5,
        speaker: 'SPEAKER_0',
      });
    });

    it('should handle complex diarization with multiple segments per speaker', () => {
      const clusters = groupSegmentsBySpeaker(diarizationComplex.segments);

      expect(Object.keys(clusters)).toHaveLength(2);
      expect(clusters['SPEAKER_0']).toHaveLength(2); // Two segments for SPEAKER_0
      expect(clusters['SPEAKER_1']).toHaveLength(1); // One segment for SPEAKER_1
    });

    it('should handle empty segments array', () => {
      const clusters = groupSegmentsBySpeaker([]);

      expect(Object.keys(clusters)).toHaveLength(0);
    });
  });

  describe('selectRepresentativeSegment', () => {
    it('should select middle segment by duration', () => {
      const segments = diarizationComplex.segments.filter(s => s.speaker === 'SPEAKER_0');
      const representative = selectRepresentativeSegment(segments);

      expect(representative).toBeDefined();
      expect(segments).toContain(representative);
    });

    it('should throw error for empty segments array', () => {
      expect(() => selectRepresentativeSegment([])).toThrow(
        'Cannot select representative from empty segment list'
      );
    });

    it('should return the only segment when array has one element', () => {
      const singleSegment = [{ start: 0, end: 5, speaker: 'SPEAKER_0' }];
      const representative = selectRepresentativeSegment(singleSegment);

      expect(representative).toEqual(singleSegment[0]);
    });
  });
});

describe('speaker utilities', () => {
  const { getStorageClient } = require('../src/lib/storage');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSpeakerRegistry', () => {
    it('should load speaker registry for valid podcast', async () => {
      const mockStorage = getStorageClient();
      mockStorage.exists.mockResolvedValue(true);
      mockStorage.loadJson.mockResolvedValue({
        askthegame: speakerRegistryBasic,
      });

      const registry = await getSpeakerRegistry('askthegame');

      expect(mockStorage.exists).toHaveBeenCalledWith('speaker-registry/askthegame.json');
      expect(mockStorage.loadJson).toHaveBeenCalledWith('speaker-registry/askthegame.json');
      expect(registry).toEqual(speakerRegistryBasic);
    });

    it('should return empty registry when file does not exist', async () => {
      const mockStorage = getStorageClient();
      mockStorage.exists.mockResolvedValue(false);

      const registry = await getSpeakerRegistry('nonexistent');

      expect(mockStorage.exists).toHaveBeenCalledWith('speaker-registry/nonexistent.json');
      expect(mockStorage.loadJson).not.toHaveBeenCalled();
      expect(registry).toEqual({});
    });

    it('should return empty registry on error', async () => {
      const mockStorage = getStorageClient();
      mockStorage.exists.mockRejectedValue(new Error('S3 error'));

      const registry = await getSpeakerRegistry('error-case');

      expect(registry).toEqual({});
    });
  });

  describe('getAudioClipUrl', () => {
    it('should generate clip URL with time parameters', async () => {
      const clipUrl = await getAudioClipUrl(
        'https://example.com/audio.mp3',
        10.5,
        15.2
      );

      expect(clipUrl).toBe('https://example.com/audio.mp3?start=10.5&end=15.2');
    });
  });

  describe('getDeepgramDiarizationFallback', () => {
    it('should convert Deepgram speakers to Pyannote format', async () => {
      const mockStorage = getStorageClient();
      const mockTranscript = {
        episode_id: 'test-123',
        asr_provider: 'deepgram',
        words: [],
        utterances: [],
        paragraphs: [],
        deepgram_speakers: [
          { start: 0.0, end: 2.0, speaker: 'dg-0' },
          { start: 2.0, end: 4.0, speaker: 'dg-1' },
        ],
      };

      mockStorage.loadJson.mockResolvedValue(mockTranscript);

      const fallback = await getDeepgramDiarizationFallback('test-123');

      expect(fallback).toEqual({
        segments: [
          { start: 0.0, end: 2.0, speaker: 'dg-0' },
          { start: 2.0, end: 4.0, speaker: 'dg-1' },
        ],
        source: 'deepgram_fallback',
      });
    });

    it('should return empty segments when no deepgram_speakers available', async () => {
      const mockStorage = getStorageClient();
      const mockTranscript = {
        episode_id: 'test-123',
        asr_provider: 'deepgram',
        words: [],
        utterances: [],
        paragraphs: [],
        // No deepgram_speakers field
      };

      mockStorage.loadJson.mockResolvedValue(mockTranscript);

      const fallback = await getDeepgramDiarizationFallback('test-123');

      expect(fallback).toEqual({
        segments: [],
        source: 'deepgram_fallback',
      });
    });

    it('should return empty segments on error', async () => {
      const mockStorage = getStorageClient();
      mockStorage.loadJson.mockRejectedValue(new Error('S3 error'));

      const fallback = await getDeepgramDiarizationFallback('test-123');

      expect(fallback).toEqual({
        segments: [],
        source: 'deepgram_fallback',
      });
    });
  });
});

describe('integration scenarios', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle complete workflow with near-miss tracking', () => {
    // Simulate a case where confidence is below threshold
    const speakerMapWithNearMiss = {
      SPEAKER_0: speakerMapBasic.SPEAKER_0,
      // SPEAKER_1 missing due to low confidence
    };

    const enriched = enrichTranscript(
      transcriptBasic,
      diarizationAligned,
      speakerMapWithNearMiss
    );

    expect(enriched).toHaveLength(2);
    expect(enriched[0].speaker).toBe('Alex Hormozi'); // Identified
    expect(enriched[1].speaker).toBe('SPEAKER_1'); // Not identified, using raw speaker key
    expect(enriched[1].speaker_confidence).toBeNull();
  });

  it('should handle complex overlapping diarization', () => {
    const complexTranscript = transcriptComplex;
    const complexDiarization = diarizationComplex;

    const enriched = enrichTranscript(complexTranscript, complexDiarization);

    expect(enriched).toHaveLength(3);
    // Each segment should be assigned to the best overlapping speaker
    enriched.forEach(segment => {
      expect(segment.diar_speaker).toMatch(/SPEAKER_[01]/);
      expect(segment.source).toBe('pyannote');
    });
  });
});