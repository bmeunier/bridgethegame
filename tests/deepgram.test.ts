import { DeepgramClient } from "../src/lib/deepgram";
import {
  DeepgramApiResponse,
  DeepgramWord,
  DeepgramUtterance,
  TranscriptEnvelope,
  DeepgramSpeakerSegment,
} from "../src/types/deepgram";

describe("DeepgramClient", () => {
  let client: DeepgramClient;

  beforeEach(() => {
    client = new DeepgramClient("test-api-key");
  });

  describe("parseResponse", () => {
    it("should parse a valid Deepgram response into normalized envelope", () => {
      const mockResponse: DeepgramApiResponse = {
        metadata: {
          transaction_key: "test-transaction",
          request_id: "test-request",
          sha256: "test-sha",
          created: "2024-01-01T00:00:00Z",
          duration: 120.5,
          channels: 1,
          models: ["general"],
          model_info: {
            general: {
              name: "general",
              version: "2024.01.01",
              arch: "nova-2",
            },
          },
        },
        results: {
          channels: [
            {
              alternatives: [
                {
                  transcript: "Hello world this is a test",
                  confidence: 0.98,
                  words: [
                    {
                      word: "Hello",
                      start: 0.0,
                      end: 0.5,
                      confidence: 0.99,
                      punctuated_word: "Hello",
                    },
                    {
                      word: "world",
                      start: 0.5,
                      end: 1.0,
                      confidence: 0.98,
                      punctuated_word: "world",
                    },
                    {
                      word: "this",
                      start: 1.2,
                      end: 1.4,
                      confidence: 0.97,
                      punctuated_word: "this",
                    },
                    {
                      word: "is",
                      start: 1.4,
                      end: 1.5,
                      confidence: 0.99,
                      punctuated_word: "is",
                    },
                    {
                      word: "a",
                      start: 1.5,
                      end: 1.6,
                      confidence: 0.99,
                      punctuated_word: "a",
                    },
                    {
                      word: "test",
                      start: 1.6,
                      end: 2.0,
                      confidence: 0.98,
                      punctuated_word: "test.",
                    },
                  ],
                  utterances: [
                    {
                      start: 0.0,
                      end: 1.0,
                      confidence: 0.98,
                      channel: 0,
                      transcript: "Hello world",
                      words: [
                        {
                          word: "Hello",
                          start: 0.0,
                          end: 0.5,
                          confidence: 0.99,
                        },
                        {
                          word: "world",
                          start: 0.5,
                          end: 1.0,
                          confidence: 0.98,
                        },
                      ],
                      id: "utterance-1",
                    },
                    {
                      start: 1.2,
                      end: 2.0,
                      confidence: 0.98,
                      channel: 0,
                      transcript: "this is a test",
                      words: [
                        {
                          word: "this",
                          start: 1.2,
                          end: 1.4,
                          confidence: 0.97,
                        },
                        {
                          word: "is",
                          start: 1.4,
                          end: 1.5,
                          confidence: 0.99,
                        },
                        {
                          word: "a",
                          start: 1.5,
                          end: 1.6,
                          confidence: 0.99,
                        },
                        {
                          word: "test",
                          start: 1.6,
                          end: 2.0,
                          confidence: 0.98,
                        },
                      ],
                      id: "utterance-2",
                    },
                  ],
                  paragraphs: {
                    transcript: "Hello world this is a test.",
                    paragraphs: [
                      {
                        sentences: [
                          {
                            text: "Hello world this is a test.",
                            start: 0.0,
                            end: 2.0,
                          },
                        ],
                        start: 0.0,
                        end: 2.0,
                        num_words: 6,
                        transcript: "Hello world this is a test.",
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      };

      const envelope = client.parseResponse("test-episode", mockResponse);

      // Check basic structure
      expect(envelope.episode_id).toBe("test-episode");
      expect(envelope.asr_provider).toBe("deepgram");
      expect(envelope.raw).toEqual(mockResponse);

      // Check words
      expect(envelope.words).toHaveLength(6);
      expect(envelope.words[0]).toEqual({
        word: "Hello",
        start: 0.0,
        end: 0.5,
        confidence: 0.99,
        speaker: null,
      });
      expect(envelope.words[5]).toEqual({
        word: "test.",
        start: 1.6,
        end: 2.0,
        confidence: 0.98,
        speaker: null,
      });

      // Check utterances
      expect(envelope.utterances).toHaveLength(2);
      expect(envelope.utterances[0]).toMatchObject({
        start: 0.0,
        end: 1.0,
        text: "Hello world",
        speaker: null,
      });
      expect(envelope.utterances[0].words).toEqual([0, 1]); // Indices of words

      // Check paragraphs
      expect(envelope.paragraphs).toHaveLength(1);
      expect(envelope.paragraphs[0]).toMatchObject({
        start: 0.0,
        end: 2.0,
        text: "Hello world this is a test.",
      });
      expect(envelope.paragraphs[0].utterances).toEqual([0, 1]); // Both utterances

      // Check metadata
      expect(envelope.metadata).toEqual({
        duration: 120.5,
        language: "en",
        model: "general",
        created_at: "2024-01-01T00:00:00Z",
      });
    });

    it("stores only the raw S3 pointer when provided", () => {
      const mockResponse: DeepgramApiResponse = {
        metadata: {
          transaction_key: "transaction-key",
          request_id: "request-id",
          sha256: "sha",
          created: "2024-01-01T00:00:00Z",
          duration: 3,
          channels: 1,
          models: ["general"],
          model_info: {
            general: {
              name: "general",
              version: "1.0.0",
              arch: "dg-decode",
            },
          },
        },
        results: {
          channels: [
            {
              alternatives: [
                {
                  transcript: "hi",
                  confidence: 0.99,
                  words: [
                    {
                      word: "hi",
                      start: 0,
                      end: 0.5,
                      confidence: 0.99,
                      punctuated_word: "Hi",
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const rawKey = "transcripts/test-episode/deepgram_raw.json";
      const envelope = client.parseResponse(
        "test-episode",
        mockResponse,
        rawKey,
      );

      expect(envelope.raw).toBeUndefined();
      expect(envelope.raw_s3_key).toBe(rawKey);
    });

    it("should handle response without utterances", () => {
      const mockResponse: DeepgramApiResponse = {
        metadata: {
          transaction_key: "test",
          request_id: "test",
          sha256: "test",
          created: "2024-01-01T00:00:00Z",
          duration: 10,
          channels: 1,
          models: ["general"],
          model_info: {},
        },
        results: {
          channels: [
            {
              alternatives: [
                {
                  transcript: "Test",
                  confidence: 0.98,
                  words: [
                    {
                      word: "Test",
                      start: 0.0,
                      end: 0.5,
                      confidence: 0.99,
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const envelope = client.parseResponse("test-episode", mockResponse);

      expect(envelope.words).toHaveLength(1);
      expect(envelope.utterances).toHaveLength(0);
      expect(envelope.paragraphs).toHaveLength(0);
    });

    it("should throw error for invalid response structure", () => {
      const invalidResponse: any = {
        metadata: {},
        results: {
          channels: [],
        },
      };

      expect(() => {
        client.parseResponse("test-episode", invalidResponse);
      }).toThrow("Invalid Deepgram response: missing channel data");
    });

    it("should handle empty words array", () => {
      const mockResponse: DeepgramApiResponse = {
        metadata: {
          transaction_key: "test",
          request_id: "test",
          sha256: "test",
          created: "2024-01-01T00:00:00Z",
          duration: 10,
          channels: 1,
          models: ["general"],
          model_info: {},
        },
        results: {
          channels: [
            {
              alternatives: [
                {
                  transcript: "",
                  confidence: 0,
                  words: [],
                },
              ],
            },
          ],
        },
      };

      const envelope = client.parseResponse("test-episode", mockResponse);

      expect(envelope.words).toHaveLength(0);
      expect(envelope.utterances).toHaveLength(0);
      expect(envelope.paragraphs).toHaveLength(0);
    });

    it("should preserve punctuated words when available", () => {
      const mockResponse: DeepgramApiResponse = {
        metadata: {
          transaction_key: "test",
          request_id: "test",
          sha256: "test",
          created: "2024-01-01T00:00:00Z",
          duration: 10,
          channels: 1,
          models: ["general"],
          model_info: {},
        },
        results: {
          channels: [
            {
              alternatives: [
                {
                  transcript: "Hello, world!",
                  confidence: 0.98,
                  words: [
                    {
                      word: "Hello",
                      start: 0.0,
                      end: 0.5,
                      confidence: 0.99,
                      punctuated_word: "Hello,",
                    },
                    {
                      word: "world",
                      start: 0.5,
                      end: 1.0,
                      confidence: 0.98,
                      punctuated_word: "world!",
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const envelope = client.parseResponse("test-episode", mockResponse);

      expect(envelope.words[0].word).toBe("Hello,");
      expect(envelope.words[1].word).toBe("world!");
    });

    it("should extract deepgram_speakers sidecar when diarization data is available", () => {
      const mockResponse: DeepgramApiResponse = {
        metadata: {
          transaction_key: "test",
          request_id: "test",
          sha256: "test",
          created: "2024-01-01T00:00:00Z",
          duration: 10,
          channels: 1,
          models: ["general"],
          model_info: {},
        },
        results: {
          channels: [
            {
              alternatives: [
                {
                  transcript: "Hello world this is a test",
                  confidence: 0.98,
                  words: [
                    {
                      word: "Hello",
                      start: 0.0,
                      end: 0.5,
                      confidence: 0.99,
                      speaker: 0,
                      speaker_confidence: 0.95,
                    },
                    {
                      word: "world",
                      start: 0.5,
                      end: 1.0,
                      confidence: 0.98,
                      speaker: 0,
                      speaker_confidence: 0.95,
                    },
                    {
                      word: "this",
                      start: 2.0,
                      end: 2.5,
                      confidence: 0.97,
                      speaker: 1,
                      speaker_confidence: 0.9,
                    },
                    {
                      word: "is",
                      start: 2.5,
                      end: 2.7,
                      confidence: 0.99,
                      speaker: 1,
                      speaker_confidence: 0.9,
                    },
                  ],
                },
              ],
            },
          ],
          utterances: [
            {
              start: 0.0,
              end: 1.0,
              confidence: 0.98,
              channel: 0,
              transcript: "Hello world",
              words: [],
              speaker: 0,
              id: "utterance-1",
            },
            {
              start: 2.0,
              end: 2.7,
              confidence: 0.97,
              channel: 0,
              transcript: "this is",
              words: [],
              speaker: 1,
              id: "utterance-2",
            },
          ],
        },
      };

      const envelope = client.parseResponse("test-episode", mockResponse);

      // Check that canonical speaker fields remain null
      expect(envelope.words[0].speaker).toBeNull();
      expect(envelope.words[1].speaker).toBeNull();
      expect(envelope.words[2].speaker).toBeNull();
      expect(envelope.words[3].speaker).toBeNull();

      // Check that deepgram_speakers sidecar is populated
      expect(envelope.deepgram_speakers).toBeDefined();
      expect(envelope.deepgram_speakers).toHaveLength(2);

      expect(envelope.deepgram_speakers![0]).toEqual({
        start: 0.0,
        end: 1.0,
        speaker: "dg-0",
      });

      expect(envelope.deepgram_speakers![1]).toEqual({
        start: 2.0,
        end: 2.7,
        speaker: "dg-1",
      });
    });

    it("should not include deepgram_speakers when no diarization data is available", () => {
      const mockResponse: DeepgramApiResponse = {
        metadata: {
          transaction_key: "test",
          request_id: "test",
          sha256: "test",
          created: "2024-01-01T00:00:00Z",
          duration: 10,
          channels: 1,
          models: ["general"],
          model_info: {},
        },
        results: {
          channels: [
            {
              alternatives: [
                {
                  transcript: "Hello world",
                  confidence: 0.98,
                  words: [
                    {
                      word: "Hello",
                      start: 0.0,
                      end: 0.5,
                      confidence: 0.99,
                    },
                    {
                      word: "world",
                      start: 0.5,
                      end: 1.0,
                      confidence: 0.98,
                    },
                  ],
                },
              ],
            },
          ],
          // No utterances array means no diarization
        },
      };

      const envelope = client.parseResponse("test-episode", mockResponse);

      // Check that deepgram_speakers is not included
      expect(envelope.deepgram_speakers).toBeUndefined();

      // Check that canonical speaker fields remain null
      expect(envelope.words[0].speaker).toBeNull();
      expect(envelope.words[1].speaker).toBeNull();
    });
  });
});

describe("TranscriptEnvelope validation", () => {
  it("should validate correct envelope structure", () => {
    const envelope: TranscriptEnvelope = {
      episode_id: "test-123",
      asr_provider: "deepgram",
      raw: {} as DeepgramApiResponse,
      words: [
        {
          word: "test",
          start: 0,
          end: 1,
          confidence: 0.99,
          speaker: null,
        },
      ],
      utterances: [
        {
          start: 0,
          end: 1,
          text: "test",
          words: [0],
          speaker: null,
        },
      ],
      paragraphs: [
        {
          start: 0,
          end: 1,
          text: "test",
          utterances: [0],
        },
      ],
      metadata: {
        duration: 1,
        language: "en",
        model: "general",
        created_at: "2024-01-01T00:00:00Z",
      },
    };

    // Type check passes if this compiles
    expect(envelope.episode_id).toBe("test-123");
    expect(envelope.asr_provider).toBe("deepgram");
    expect(envelope.words[0].speaker).toBeNull();
    expect(envelope.utterances[0].speaker).toBeNull();
    expect(envelope.deepgram_speakers).toBeUndefined(); // Optional field
  });

  it("should validate envelope with deepgram_speakers sidecar", () => {
    const envelope: TranscriptEnvelope = {
      episode_id: "test-123",
      asr_provider: "deepgram",
      raw: {} as DeepgramApiResponse,
      words: [
        {
          word: "test",
          start: 0,
          end: 1,
          confidence: 0.99,
          speaker: null, // Canonical field remains null
        },
      ],
      utterances: [
        {
          start: 0,
          end: 1,
          text: "test",
          words: [0],
          speaker: null, // Canonical field remains null
        },
      ],
      paragraphs: [
        {
          start: 0,
          end: 1,
          text: "test",
          utterances: [0],
        },
      ],
      deepgram_speakers: [
        {
          start: 0,
          end: 1,
          speaker: "dg-0",
        },
      ],
      metadata: {
        duration: 1,
        language: "en",
        model: "general",
        created_at: "2024-01-01T00:00:00Z",
      },
    };

    // Type check passes if this compiles
    expect(envelope.episode_id).toBe("test-123");
    expect(envelope.asr_provider).toBe("deepgram");
    expect(envelope.words[0].speaker).toBeNull(); // Canonical remains null
    expect(envelope.utterances[0].speaker).toBeNull(); // Canonical remains null
    expect(envelope.deepgram_speakers).toBeDefined(); // Sidecar is present
    expect(envelope.deepgram_speakers![0].speaker).toBe("dg-0"); // Sidecar format
  });
});
