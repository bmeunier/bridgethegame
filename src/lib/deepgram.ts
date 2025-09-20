/**
 * Deepgram API client for transcription services
 *
 * This client implements the addendum requirements for Plan 3:
 * - Maintains canonical transcript structure with speaker fields as null (for pyannote integration)
 * - Preserves Deepgram's diarization output in an optional "deepgram_speakers" sidecar field
 * - Enables debugging and confidence ensemble analysis without breaking the main pipeline
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  DeepgramApiResponse,
  DeepgramTranscribeParams,
  TranscriptEnvelope,
  NormalizedWord,
  NormalizedUtterance,
  NormalizedParagraph,
  DeepgramSpeakerSegment,
} from '../types/deepgram';

export class DeepgramClient {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.DEEPGRAM_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('DEEPGRAM_API_KEY is required');
    }

    this.client = axios.create({
      baseURL: 'https://api.deepgram.com',
      headers: {
        'Authorization': `Token ${this.apiKey}`,
      },
      timeout: 600000, // 10 minutes for large files
    });
  }

  /**
   * Transcribe audio from URL using Deepgram
   */
  async transcribeFromUrl(
    audioUrl: string,
    params?: Partial<DeepgramTranscribeParams>
  ): Promise<DeepgramApiResponse> {
    const defaultParams: DeepgramTranscribeParams = {
      model: 'general',
      punctuate: true,
      utterances: true,
      paragraphs: true,
      diarize: false, // We'll use pyannote for this
      timestamps: true,
      filler_words: false,
      profanity_filter: false,
      language: 'en',
      smart_format: true,
    };

    const finalParams = { ...defaultParams, ...params };

    try {
      console.log(JSON.stringify({
        scope: 'deepgram_client',
        action: 'transcribe_start',
        audio_url: audioUrl,
        params: finalParams,
      }));

      const response = await this.client.post<DeepgramApiResponse>(
        '/v1/listen',
        { url: audioUrl },
        { params: finalParams }
      );

      console.log(JSON.stringify({
        scope: 'deepgram_client',
        action: 'transcribe_success',
        request_id: response.data.metadata.request_id,
        duration: response.data.metadata.duration,
      }));

      return response.data;
    } catch (error) {
      this.handleError(error);
      throw error; // Re-throw after logging
    }
  }

  /**
   * Transcribe audio from buffer using Deepgram
   */
  async transcribeFromBuffer(
    audioBuffer: Buffer,
    contentType: string,
    params?: Partial<DeepgramTranscribeParams>
  ): Promise<DeepgramApiResponse> {
    const defaultParams: DeepgramTranscribeParams = {
      model: 'general',
      punctuate: true,
      utterances: true,
      paragraphs: true,
      diarize: false,
      timestamps: true,
      filler_words: false,
      profanity_filter: false,
      language: 'en',
      smart_format: true,
    };

    const finalParams = { ...defaultParams, ...params };

    try {
      console.log(JSON.stringify({
        scope: 'deepgram_client',
        action: 'transcribe_buffer_start',
        buffer_size: audioBuffer.length,
        content_type: contentType,
        params: finalParams,
      }));

      const response = await this.client.post<DeepgramApiResponse>(
        '/v1/listen',
        audioBuffer,
        {
          params: finalParams,
          headers: {
            'Content-Type': contentType,
          },
        }
      );

      console.log(JSON.stringify({
        scope: 'deepgram_client',
        action: 'transcribe_buffer_success',
        request_id: response.data.metadata.request_id,
        duration: response.data.metadata.duration,
      }));

      return response.data;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Parse Deepgram response into normalized transcript envelope
   *
   * IMPORTANT: This method implements the addendum contract:
   * - All canonical speaker fields (words.speaker, utterances.speaker) remain null
   * - Deepgram's diarization data is preserved in the optional "deepgram_speakers" sidecar field
   * - The sidecar field is only included when diarization data is available
   * - Word-level timestamps are preserved exactly for future pyannote alignment
   */
  parseResponse(
    episodeId: string,
    deepgramResponse: DeepgramApiResponse
  ): TranscriptEnvelope {
    const words: NormalizedWord[] = [];
    const utterances: NormalizedUtterance[] = [];
    const paragraphs: NormalizedParagraph[] = [];

    // Extract from the first channel (mono audio)
    const channel = deepgramResponse.results.channels[0];
    if (!channel || !channel.alternatives[0]) {
      throw new Error('Invalid Deepgram response: missing channel data');
    }

    const alternative = channel.alternatives[0];

    // Process words
    if (alternative.words) {
      alternative.words.forEach((word) => {
        words.push({
          word: word.punctuated_word || word.word,
          start: word.start,
          end: word.end,
          confidence: word.confidence,
          speaker: null, // Will be filled by pyannote
        });
      });
    }

    // Process utterances
    if (alternative.utterances) {
      alternative.utterances.forEach((utterance) => {
        const wordIndices: number[] = [];

        // Find word indices for this utterance
        utterance.words.forEach(uWord => {
          // Match words by timestamp
          const wordIndex = words.findIndex(w =>
            Math.abs(w.start - uWord.start) < 0.01 &&
            Math.abs(w.end - uWord.end) < 0.01
          );
          if (wordIndex >= 0) {
            wordIndices.push(wordIndex);
          }
        });

        utterances.push({
          start: utterance.start,
          end: utterance.end,
          text: utterance.transcript,
          words: wordIndices,
          speaker: null, // Will be filled by pyannote
        });
      });
    }

    // Process paragraphs
    if (alternative.paragraphs?.paragraphs) {
      alternative.paragraphs.paragraphs.forEach((paragraph) => {
        // Find utterances that belong to this paragraph
        const paragraphUtterances: number[] = [];
        utterances.forEach((utterance, index) => {
          if (utterance.start >= paragraph.start && utterance.end <= paragraph.end) {
            paragraphUtterances.push(index);
          }
        });

        paragraphs.push({
          start: paragraph.start,
          end: paragraph.end,
          text: paragraph.transcript,
          utterances: paragraphUtterances,
        });
      });
    }

    // Extract Deepgram speaker segments (sidecar field for debugging/analysis)
    const deepgramSpeakers: DeepgramSpeakerSegment[] = [];

    // Use top-level utterances if available (these contain speaker diarization)
    if (deepgramResponse.results.utterances) {
      deepgramResponse.results.utterances.forEach((utterance) => {
        if (utterance.speaker !== undefined && utterance.speaker !== null) {
          deepgramSpeakers.push({
            start: utterance.start,
            end: utterance.end,
            speaker: `dg-${utterance.speaker}`, // Format: "dg-0", "dg-1", etc.
          });
        }
      });
    }

    // Build the envelope
    const envelope: TranscriptEnvelope = {
      episode_id: episodeId,
      asr_provider: 'deepgram',
      raw: deepgramResponse,
      words,
      utterances,
      paragraphs,
      metadata: {
        duration: deepgramResponse.metadata.duration,
        language: 'en', // We specified this in params
        model: deepgramResponse.metadata.models[0],
        created_at: deepgramResponse.metadata.created,
      },
    };

    // Add deepgram_speakers only if we found speaker segments
    if (deepgramSpeakers.length > 0) {
      envelope.deepgram_speakers = deepgramSpeakers;
    }

    return envelope;
  }

  /**
   * Handle and log API errors
   */
  private handleError(error: unknown): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const errorLog = {
        scope: 'deepgram_client',
        action: 'error',
        status_code: axiosError.response?.status,
        error_message: axiosError.message,
        error_data: axiosError.response?.data,
      };

      console.error(JSON.stringify(errorLog));

      // Throw more specific errors
      if (axiosError.response?.status === 401) {
        throw new Error('Deepgram authentication failed. Check API key.');
      }
      if (axiosError.response?.status === 429) {
        throw new Error('Deepgram rate limit exceeded. Retry later.');
      }
      if (axiosError.response?.status === 400) {
        throw new Error(`Deepgram bad request: ${JSON.stringify(axiosError.response.data)}`);
      }
    } else {
      console.error(JSON.stringify({
        scope: 'deepgram_client',
        action: 'error',
        error_type: 'unknown',
        error: error,
      }));
    }
  }
}

// Export singleton instance (lazy initialization)
let _deepgramClient: DeepgramClient | null = null;

export function getDeepgramClient(): DeepgramClient {
  if (!_deepgramClient) {
    _deepgramClient = new DeepgramClient();
  }
  return _deepgramClient;
}

// Export for backward compatibility
export const deepgramClient = {
  transcribeFromUrl: (...args: Parameters<DeepgramClient['transcribeFromUrl']>) =>
    getDeepgramClient().transcribeFromUrl(...args),
  transcribeFromBuffer: (...args: Parameters<DeepgramClient['transcribeFromBuffer']>) =>
    getDeepgramClient().transcribeFromBuffer(...args),
  parseResponse: (...args: Parameters<DeepgramClient['parseResponse']>) =>
    getDeepgramClient().parseResponse(...args),
};