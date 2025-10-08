/**
 * Deepgram API response types and normalized transcript envelope
 */

// Deepgram API Response Types
export interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  punctuated_word?: string;
  speaker?: number;
  speaker_confidence?: number;
}

export interface DeepgramUtterance {
  start: number;
  end: number;
  confidence: number;
  channel: number;
  transcript: string;
  words: DeepgramWord[];
  speaker?: number;
  id: string;
}

export interface DeepgramParagraph {
  sentences: Array<{
    text: string;
    start: number;
    end: number;
  }>;
  start: number;
  end: number;
  num_words: number;
  transcript: string;
}

export interface DeepgramAlternative {
  transcript: string;
  confidence: number;
  words: DeepgramWord[];
  utterances?: DeepgramUtterance[];
  paragraphs?: {
    transcript: string;
    paragraphs: DeepgramParagraph[];
  };
}

export interface DeepgramChannel {
  alternatives: DeepgramAlternative[];
}

export interface DeepgramResult {
  channels: DeepgramChannel[];
  utterances?: DeepgramUtterance[];
}

export interface DeepgramMetadata {
  transaction_key: string;
  request_id: string;
  sha256: string;
  created: string;
  duration: number;
  channels: number;
  models: string[];
  model_info: Record<
    string,
    {
      name: string;
      version: string;
      arch: string;
    }
  >;
}

export interface DeepgramApiResponse {
  metadata: DeepgramMetadata;
  results: DeepgramResult;
}

// Normalized Transcript Envelope Types
export interface NormalizedWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker: null; // To be filled by pyannote later
}

export interface NormalizedUtterance {
  start: number;
  end: number;
  text: string;
  words: number[]; // Indices into words array
  speaker: null; // To be filled by pyannote later
}

export interface NormalizedParagraph {
  start: number;
  end: number;
  text: string;
  utterances: number[]; // Indices into utterances array
}

// Deepgram Speaker Segment (sidecar field for debugging/analysis)
export interface DeepgramSpeakerSegment {
  start: number;
  end: number;
  speaker: string; // Format: "dg-0", "dg-1", etc.
}

export interface TranscriptEnvelope {
  episode_id: string;
  asr_provider: "deepgram";
  raw?: DeepgramApiResponse; // Present when working with in-memory responses
  raw_s3_key?: string; // Preferred pointer to the archived Deepgram payload
  words: NormalizedWord[];
  utterances: NormalizedUtterance[];
  paragraphs: NormalizedParagraph[];
  /**
   * Optional sidecar field containing Deepgram's speaker diarization segments.
   * This preserves Deepgram's native speaker detection for debugging and analysis,
   * while keeping canonical speaker fields (in words/utterances/paragraphs) as null
   * for pyannote integration.
   */
  deepgram_speakers?: DeepgramSpeakerSegment[];
  metadata?: {
    duration: number;
    language?: string;
    model?: string;
    created_at: string;
  };
}

// Deepgram API Request Parameters
export interface DeepgramTranscribeParams {
  model?: string;
  punctuate?: boolean;
  utterances?: boolean;
  paragraphs?: boolean;
  diarize?: boolean;
  timestamps?: boolean;
  filler_words?: boolean;
  profanity_filter?: boolean;
  language?: string;
  smart_format?: boolean;
}
