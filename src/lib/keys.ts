/**
 * Deterministic storage keys for all pipeline data
 * Single source of truth for S3 paths
 */

export const keys = {
  // Diarization data
  diarizationRaw: (id: string) => `diarization/${id}/pyannote_raw.json`,
  speakerMap: (id: string) => `diarization/${id}/speaker_map.json`,
  nearMisses: (id: string) => `diarization/${id}/near_misses.json`,
  enriched: (id: string) => `diarization/${id}/enriched.json`,

  // Transcript data
  transcript: (id: string) => `transcripts/${id}/deepgram.json`,

  // Error tracking
  error: (id: string, timestamp: number) =>
    `diarization/${id}/errors/${timestamp}.json`,
} as const;
