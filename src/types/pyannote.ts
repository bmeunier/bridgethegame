/**
 * Pyannote API types and enriched transcript definitions
 */

// Pyannote API Response Types
export interface PyannoteSegment {
  start: number;
  end: number;
  speaker: string; // e.g., "SPEAKER_0", "SPEAKER_1"
}

export interface PyannoteDiarizationResponse {
  segments: PyannoteSegment[];
  source?: "pyannote" | "deepgram_fallback";
}

export interface PyannoteSpeakerIdentificationResponse {
  speaker: string;
  confidence: number;
}

export interface PyannoteSpeakerIdentificationResult {
  matches: boolean;
  confidence: number;
  referenceId: string;
}

// Speaker Registry Types
export interface SpeakerInfo {
  displayName: string;
  referenceId: string;
  threshold: number;
}

export interface SpeakerRegistry {
  [podcastId: string]: {
    [speakerKey: string]: SpeakerInfo;
  };
}

// Enriched Transcript Types (extends the normalized types from Deepgram)
export interface EnrichedTranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker: string; // Resolved speaker name (e.g., "Alex Hormozi") or diarization key
  diar_speaker: string; // Original diarization speaker key (e.g., "SPEAKER_0")
  speaker_confidence: number | null; // Confidence score for speaker identification
  source: "pyannote" | "deepgram_fallback";
  alternatives?: Array<{
    speaker: string;
    confidence: number;
  }>;
}

// Speaker Map for cluster-level identification
export interface SpeakerMapEntry {
  displayName: string;
  confidence: number;
  referenceId: string;
}

export interface SpeakerMap {
  [clusterKey: string]: SpeakerMapEntry;
}

// Near-miss tracking for threshold tuning
export interface NearMiss {
  clusterKey: string;
  confidence: number;
  threshold: number;
  referenceId: string;
}

// Cluster summary for audit artifacts
export interface ClusterSummary {
  speakerKey: string;
  duration: number;
  segmentsCount: number;
  mappedTo: string | null;
  confidence: number | null;
}

// Audit Artifacts
export interface PyannoteAuditArtifacts {
  clusters: ClusterSummary[];
  totalSegments: number;
  source: "pyannote" | "deepgram_fallback";
  nearMisses: NearMiss[];
}

// Cluster grouping type
export interface SpeakerClusters {
  [speakerKey: string]: PyannoteSegment[];
}

// Event data types for Inngest integration
export interface DiarizationRequestEvent {
  episode_id: string;
  podcast_id: string;
  audio_url: string;
  transcript_key: string;
  word_count?: number;
  duration?: number;
}

export interface DiarizationCompletedEvent {
  episode_id: string;
  s3_enriched_path: string;
  s3_audit_path: string;
}
