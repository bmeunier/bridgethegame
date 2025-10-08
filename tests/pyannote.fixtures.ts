/**
 * Test fixtures for pyannote unit tests
 */

import {
  PyannoteDiarizationResponse,
  PyannoteSpeakerIdentificationResponse,
  SpeakerRegistry,
  EnrichedTranscriptSegment,
  PyannoteAuditArtifacts,
  SpeakerMap,
} from "../src/types/pyannote";
import { NormalizedWord, NormalizedUtterance } from "../src/types/deepgram";

// Basic transcript segments for testing alignment
export const transcriptBasic: NormalizedWord[] = [
  {
    word: "Hello",
    start: 0.0,
    end: 2.0,
    confidence: 0.99,
    speaker: null,
  },
  {
    word: "World",
    start: 2.0,
    end: 4.0,
    confidence: 0.98,
    speaker: null,
  },
];

export const transcriptUtterances: NormalizedUtterance[] = [
  {
    start: 0.0,
    end: 2.0,
    text: "Hello",
    words: [0],
    speaker: null,
  },
  {
    start: 2.0,
    end: 4.0,
    text: "World",
    words: [1],
    speaker: null,
  },
];

// Aligned diarization data
export const diarizationAligned: PyannoteDiarizationResponse = {
  segments: [
    { start: 0.0, end: 2.5, speaker: "SPEAKER_0" },
    { start: 2.5, end: 5.0, speaker: "SPEAKER_1" },
  ],
  source: "pyannote",
};

// Empty diarization for edge case testing
export const diarizationEmpty: PyannoteDiarizationResponse = {
  segments: [],
  source: "pyannote",
};

// Overlapping diarization for IoU testing
export const diarizationOverlapping: PyannoteDiarizationResponse = {
  segments: [
    { start: 0.5, end: 1.5, speaker: "SPEAKER_0" },
    { start: 1.0, end: 3.0, speaker: "SPEAKER_1" },
    { start: 2.5, end: 4.5, speaker: "SPEAKER_0" },
  ],
  source: "pyannote",
};

// Fallback diarization from Deepgram
export const diarizationFallback: PyannoteDiarizationResponse = {
  segments: [
    { start: 0.0, end: 2.0, speaker: "dg-0" },
    { start: 2.0, end: 4.0, speaker: "dg-1" },
  ],
  source: "deepgram_fallback",
};

// Speaker registry for testing
export const speakerRegistryBasic: Record<string, any> = {
  HORMOZI: {
    displayName: "Alex Hormozi",
    referenceId: "ref_hormozi_123",
    threshold: 0.85,
  },
  GUEST_HOST: {
    displayName: "Jane Doe",
    referenceId: "ref_janedoe_456",
    threshold: 0.8,
  },
};

// Full speaker registry with multiple podcasts
export const speakerRegistryFull: SpeakerRegistry = {
  askthegame: {
    HORMOZI: {
      displayName: "Alex Hormozi",
      referenceId: "ref_hormozi_123",
      threshold: 0.85,
    },
  },
  anotherpodcast: {
    HOST_A: {
      displayName: "Jane Doe",
      referenceId: "ref_janedoe_456",
      threshold: 0.8,
    },
    HOST_B: {
      displayName: "John Smith",
      referenceId: "ref_johnsmith_789",
      threshold: 0.82,
    },
  },
};

// Speaker map for cluster-level identification
export const speakerMapBasic: SpeakerMap = {
  SPEAKER_0: {
    displayName: "Alex Hormozi",
    confidence: 0.92,
    referenceId: "ref_hormozi_123",
  },
  SPEAKER_1: {
    displayName: "Guest_1",
    confidence: 0.87,
    referenceId: "ref_guest_456",
  },
};

// Mock API responses
export const mockDiarizationApiResponse = {
  segments: [
    { start: 0.0, end: 2.5, speaker: "SPEAKER_0" },
    { start: 2.5, end: 5.0, speaker: "SPEAKER_1" },
  ],
};

export const mockSpeakerIdentificationSuccessResponse: PyannoteSpeakerIdentificationResponse =
  {
    speaker: "ref_hormozi_123",
    confidence: 0.92,
  };

export const mockSpeakerIdentificationFailResponse: PyannoteSpeakerIdentificationResponse =
  {
    speaker: "unknown_speaker",
    confidence: 0.45,
  };

// Expected enriched transcript
export const expectedEnrichedTranscript: EnrichedTranscriptSegment[] = [
  {
    start: 0.0,
    end: 2.0,
    text: "Hello",
    speaker: "Alex Hormozi",
    diar_speaker: "SPEAKER_0",
    speaker_confidence: 0.92,
    source: "pyannote",
  },
  {
    start: 2.0,
    end: 4.0,
    text: "World",
    speaker: "Guest_1",
    diar_speaker: "SPEAKER_1",
    speaker_confidence: 0.87,
    source: "pyannote",
  },
];

// Audit artifacts for testing
export const expectedAuditArtifacts: PyannoteAuditArtifacts = {
  clusters: [
    {
      speakerKey: "SPEAKER_0",
      duration: 2.5,
      segmentsCount: 1,
      mappedTo: "Alex Hormozi",
      confidence: 0.92,
    },
    {
      speakerKey: "SPEAKER_1",
      duration: 2.5,
      segmentsCount: 1,
      mappedTo: "Guest_1",
      confidence: 0.87,
    },
  ],
  totalSegments: 2,
  source: "pyannote",
  nearMisses: [],
};

// Near-miss cases for threshold testing
export const nearMissCase = {
  clusterKey: "SPEAKER_2",
  confidence: 0.82,
  threshold: 0.85,
  referenceId: "ref_hormozi_123",
};

// Complex transcript for advanced testing
export const transcriptComplex: NormalizedUtterance[] = [
  {
    start: 0.0,
    end: 3.0,
    text: "Welcome to the podcast",
    words: [0, 1, 2, 3],
    speaker: null,
  },
  {
    start: 3.5,
    end: 6.0,
    text: "Thanks for having me",
    words: [4, 5, 6, 7],
    speaker: null,
  },
  {
    start: 7.0,
    end: 10.0,
    text: "Let me share my thoughts",
    words: [8, 9, 10, 11, 12],
    speaker: null,
  },
];

export const diarizationComplex: PyannoteDiarizationResponse = {
  segments: [
    { start: 0.0, end: 3.5, speaker: "SPEAKER_0" },
    { start: 3.2, end: 6.5, speaker: "SPEAKER_1" },
    { start: 6.8, end: 10.5, speaker: "SPEAKER_0" },
  ],
  source: "pyannote",
};

// Mock fetch responses for API testing
export const mockFetchSuccess = (responseData: any) => ({
  ok: true,
  json: async () => responseData,
  text: async () => JSON.stringify(responseData),
  status: 200,
});

export const mockFetchError = (status: number, message: string) => ({
  ok: false,
  json: async () => ({ error: message }),
  text: async () => message,
  status,
});

// Helper function to create mock fetch implementation
export const createMockFetch = (responses: any[]) => {
  let callCount = 0;
  return jest.fn(() => {
    const response = responses[callCount] || responses[responses.length - 1];
    callCount++;
    return Promise.resolve(response);
  });
};
