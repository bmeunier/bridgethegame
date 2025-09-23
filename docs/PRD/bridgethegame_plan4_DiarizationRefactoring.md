# Step 3.6 Diarization: S3-First Refactor Prompt for Claude Code

This document combines the **mega-prompt**, **sample code suggestions**, and **mock fixtures/tests** into one place so Claude Code can implement and you can review.

---

## Problem

During diarization we hit this error:

```
error validating generator opcode ... step output size is greater than the limit
```

Cause: the diarization step currently returns the **full diarization JSON** through Inngest, which exceeds the step output size limit.

We already solved this problem for **Deepgram transcripts** using an **S3-first pattern**.

---

## Goal

Refactor `diarize_episode.ts` to use the S3-first pattern:

- Save the full diarization JSON to S3.  
- Only return lightweight metadata + S3 path through Inngest.  
- Preserve consistency with Deepgram’s solution.

---

## Deepgram Pattern Recap

```json
{
  "episode_id": "XWPJS196C945",
  "s3_transcript_path": "s3://bucket/transcripts/XWPJS196C945.json",
  "stats": { "words": 77945 }
}
```

---

## Requirements for Diarization

1. Input: `episode_id`, `audio_url`, `s3_transcript_path`.  
2. Process: Call Pyannote API → get diarization segments.  
3. Save diarization result in S3:  
   `s3://bucket/diarization/<episode_id>.json`  
4. Output only lightweight payload:

```json
{
  "episode_id": "XWPJS196C945",
  "s3_diarization_path": "s3://bucket/diarization/XWPJS196C945.json",
  "stats": {
    "num_segments": 142,
    "duration": 2400.5
  }
}
```

5. Error handling: if Pyannote API fails, emit `status: "failed"` and log to S3.

---

## Suggested Code Skeleton

```ts
import { inngest } from "@/inngest/client";
import { putS3Object } from "@/utils/s3";
import { diarize } from "@/utils/pyannote";

export const diarizeFn = inngest.createFunction(
  { name: "Pyannote Diarization" },
  { event: "episode.transcribed.deepgram.completed" },
  async ({ event, step }) => {
    const { episode_id, audio_url } = event.data;

    // 1. Call Pyannote API
    const diarization = await step.run("pyannote-diarize", async () => {
      return diarize(audio_url, process.env.PYANNOTE_API_KEY);
    });

    // 2. Save diarization JSON to S3
    const s3_diarization_path = `s3://bridgethegame/diarization/${episode_id}.json`;
    await putS3Object(s3_diarization_path, JSON.stringify(diarization));

    // 3. Collect stats
    const num_segments = diarization.segments.length;
    const duration = diarization.segments.reduce((sum, s) => sum + (s.end - s.start), 0);

    // 4. Return lightweight payload
    return {
      episode_id,
      s3_diarization_path,
      stats: { num_segments, duration }
    };
  }
);
```

---

## Tests to Add

- ✅ Mock diarization with 3 segments → confirm S3 write + correct stats.  
- ✅ Fail Pyannote API → event includes `status: "failed"`.  
- ✅ Large diarization (simulate 1000+ segments) → still only returns pointer + stats.  

---

## Mock Fixture

`diarization.fixture.json`

```json
{
  "segments": [
    { "start": 0.0, "end": 2.5, "speaker": "SPEAKER_0" },
    { "start": 2.5, "end": 5.0, "speaker": "SPEAKER_1" },
    { "start": 5.0, "end": 8.0, "speaker": "SPEAKER_0" }
  ]
}
```

---

## Example Test (Vitest)

```ts
import { describe, it, expect, vi } from "vitest";
import { putS3Object } from "@/utils/s3";
import { diarizeFn } from "@/inngest/functions/diarize_episode";
import diarizationFixture from "./diarization.fixture.json";

vi.mock("@/utils/s3", () => ({
  putS3Object: vi.fn()
}));

describe("diarizeFn", () => {
  it("saves diarization to S3 and returns stats", async () => {
    const event = {
      data: {
        episode_id: "TEST123",
        audio_url: "http://example.com/audio.mp3",
        s3_transcript_path: "s3://bucket/transcripts/TEST123.json"
      }
    };

    // Mock diarize util to return fixture
    const diarize = vi.fn().mockResolvedValue(diarizationFixture);

    const result = await diarizeFn.handler({ event, step: { run: (n,f) => f() } });

    expect(putS3Object).toHaveBeenCalled();
    expect(result.stats.num_segments).toBe(3);
    expect(Math.round(result.stats.duration * 10) / 10).toBe(8.0);
  });
});
```

---

## Deliverable

- Updated `diarize_episode.ts` using the S3-first pattern.  
- Unit test added with fixture.  
- Inngest output always lightweight, never fails size validation.


# Step 3.6 Diarization: S3-First Refactor & Enrichment Plan

This document consolidates the original diarization refactor prompt, Claude Code’s feedback, and our agreed improvements. It is the authoritative spec for the S3-first, cluster-level diarization and enrichment pipeline.

---

## Problem

The current diarization step returns the full diarization JSON through Inngest, exceeding step output size limits:

```
error validating generator opcode ... step output size is greater than the limit
```

Additionally, the design must support scalable, reliable, and auditable diarization, enable robust speaker identification, and facilitate downstream enrichment and alignment with transcripts.

---

## Goal

Refactor and extend the diarization pipeline to:

- **Adopt S3-first pattern:** All large outputs (raw diarization, enriched output, audit artifacts) are immediately saved to S3; only lightweight keys and stats are returned via Inngest.
- **Cluster-level speaker identification:** Identify speakers at the cluster level (not per-segment), with representative clips for each cluster.
- **Preserve and propagate confidence scores:** Store and surface `speaker_confidence` in enriched data; log near-misses for auditing.
- **IoU-based alignment:** Merge diarization with transcript using IoU-based alignment; for now, assign a single speaker label per word (no multi-label).
- **Fallback to Deepgram diarization:** If Pyannote fails or is unavailable, use Deepgram diarization with `source: "deepgram_fallback"`.
- **Enriched schema:** Output must include `speaker`, `speaker_confidence`, `diar_speaker`, `source`, and optional `alternatives` (for audit only).
- **Key-based storage:** Only return S3 keys (not URIs) using existing storage helpers.
- **Robust error handling:** Persist errors, handle registry unavailability, support partial reruns.
- **Performance:** Optimize for cluster-level processing, concurrency control, and S3-first I/O.
- **Explicit contracts:** Clarify step names, thresholds, representative clip logic, and event payloads.

---

## Requirements

### Inputs
- `episode_id`
- `audio_url`
- `s3_transcript_key` (S3 key, not URI)

### Outputs (Step Return)
```json
{
  "episode_id": "XWPJS196C945",
  "s3_diarization_key": "diarization/XWPJS196C945.json",
  "stats": {
    "num_segments": 142,
    "duration": 2400.5
  }
}
```
> *No S3 URIs. All paths are keys, using storage helpers.*

### S3 Artifacts
- **Raw diarization:** `diarization/<episode_id>.json`
- **Enriched output:** `diarization/<episode_id>.enriched.json`
- **Audit artifacts:** e.g., `diarization/<episode_id>.audit.json`
- **Error logs:** `diarization/<episode_id>.error.json`

### Enriched Output Schema
```json
{
  "words": [
    {
      "start": 1.23,
      "end": 1.56,
      "word": "hello",
      "speaker": "A",                  // cluster-level label
      "speaker_confidence": 0.98,      // confidence for assigned speaker
      "diar_speaker": "SPEAKER_0",     // original diarization speaker label
      "source": "pyannote",            // or "deepgram_fallback"
      "alternatives": [                // (optional, for audit only)
        { "speaker": "B", "confidence": 0.65 }
      ]
    }
  ]
}
```

---

## Flow Overview

1. **Diarization step**  
   - Input: `episode_id`, `audio_url`, `s3_transcript_key`
   - Call Pyannote API (or fallback to Deepgram)
   - Save raw diarization to S3 (`diarization/<episode_id>.json`)
   - Return only S3 key + stats

2. **Speaker clustering & identification**  
   - Cluster diarization segments to canonical speakers (A, B, etc.)
   - For each cluster, select a representative clip (e.g., longest, highest-confidence segment)
   - (Optional: Save representative clips for audit)
   - Assign `speaker_confidence` at cluster level

3. **Enrichment & alignment**  
   - IoU-based alignment: For each transcript word, assign the diarization cluster with largest IoU
   - No multi-label words (for now)
   - Attach `speaker`, `speaker_confidence`, `diar_speaker`, `source`
   - Log near-miss alternatives in `alternatives` (audit only)
   - Save enriched output to S3 (`diarization/<episode_id>.enriched.json`)

4. **Error handling**  
   - On API error: persist error JSON in S3, return status `"failed"`, include error in step return
   - On registry unavailable: persist error, allow for partial rerun
   - All step outputs remain lightweight

---

## Code Skeleton

```ts
import { inngest } from "@/inngest/client";
import { putS3Object, getS3Key } from "@/utils/s3";
import { diarize, clusterSpeakers, enrichTranscript } from "@/utils/diarization";

export const diarizeFn = inngest.createFunction(
  { name: "Pyannote Diarization (S3-First)" },
  { event: "episode.transcribed.deepgram.completed" },
  async ({ event, step }) => {
    const { episode_id, audio_url, s3_transcript_key } = event.data;
    let diarization, source = "pyannote";
    try {
      diarization = await step.run("pyannote-diarize", async () =>
        diarize(audio_url, process.env.PYANNOTE_API_KEY)
      );
    } catch (e) {
      // Fallback to Deepgram diarization
      diarization = await step.run("deepgram-diarize-fallback", async () =>
        diarize(audio_url, null, { fallback: "deepgram" })
      );
      source = "deepgram_fallback";
    }

    const diarization_key = `diarization/${episode_id}.json`;
    await putS3Object(diarization_key, JSON.stringify(diarization));

    // Cluster speakers at cluster-level
    const clusters = await step.run("cluster-speakers", async () =>
      clusterSpeakers(diarization)
    );
    // Select representative clip per cluster, calculate confidences
    // ...

    // Enrich transcript via IoU alignment
    const enriched = await step.run("enrich-transcript", async () =>
      enrichTranscript(s3_transcript_key, clusters, diarization, source)
    );
    const enriched_key = `diarization/${episode_id}.enriched.json`;
    await putS3Object(enriched_key, JSON.stringify(enriched));

    // Collect stats
    const num_segments = diarization.segments.length;
    const duration = diarization.segments.reduce((sum, s) => sum + (s.end - s.start), 0);

    return {
      episode_id,
      s3_diarization_key: diarization_key,
      stats: { num_segments, duration }
      // Errors, if any, can be included here as well
    };
  }
);
```

---

## Tests

- ✅ Mock diarization (3 segments) → confirm S3 write, correct stats, correct keys.
- ✅ Pyannote API failure → falls back to Deepgram, returns `source: "deepgram_fallback"`.
- ✅ Large diarization (simulate 1000+ segments) → only returns key + stats.
- ✅ Enriched output contains `speaker`, `speaker_confidence`, `diar_speaker`, `source`, and `alternatives` (if audit enabled).
- ✅ Error handling: persists error artifact, step output remains lightweight.
- ✅ Handles registry unavailable: error is persisted, partial rerun is possible.

---

## Mock Fixtures

`diarization.fixture.json`
```json
{
  "segments": [
    { "start": 0.0, "end": 2.5, "speaker": "SPEAKER_0", "confidence": 0.96 },
    { "start": 2.5, "end": 5.0, "speaker": "SPEAKER_1", "confidence": 0.91 },
    { "start": 5.0, "end": 8.0, "speaker": "SPEAKER_0", "confidence": 0.93 }
  ]
}
```

`enriched.fixture.json`
```json
{
  "words": [
    {
      "start": 0.1,
      "end": 0.3,
      "word": "hello",
      "speaker": "A",
      "speaker_confidence": 0.95,
      "diar_speaker": "SPEAKER_0",
      "source": "pyannote",
      "alternatives": [{ "speaker": "B", "confidence": 0.6 }]
    }
  ]
}
```

---

## Example Test (Vitest)

```ts
import { describe, it, expect, vi } from "vitest";
import { putS3Object } from "@/utils/s3";
import { diarizeFn } from "@/inngest/functions/diarize_episode";
import diarizationFixture from "./diarization.fixture.json";

vi.mock("@/utils/s3", () => ({
  putS3Object: vi.fn()
}));

describe("diarizeFn", () => {
  it("saves diarization to S3 and returns stats", async () => {
    const event = {
      data: {
        episode_id: "TEST123",
        audio_url: "http://example.com/audio.mp3",
        s3_transcript_key: "transcripts/TEST123.json"
      }
    };

    const diarize = vi.fn().mockResolvedValue(diarizationFixture);
    const result = await diarizeFn.handler({ event, step: { run: (n,f) => f() } });

    expect(putS3Object).toHaveBeenCalled();
    expect(result.stats.num_segments).toBe(3);
    expect(Math.round(result.stats.duration * 10) / 10).toBe(8.0);
    expect(result.s3_diarization_key).toBe("diarization/TEST123.json");
  });
});
```

---

## Deliverables

- Updated `diarize_episode.ts` using S3-first, cluster-level, fallback-aware pattern.
- Unit tests and fixtures as above.
- All outputs are lightweight; large artifacts are persisted to S3 by key.
- Enriched output and audit artifacts are stored and keyed.
- Errors are persisted and step outputs remain within size limits.

---

## Feedback Mapping

- **S3-first, multi-step processing:** Adopted; all large outputs are S3-first.
- **Cluster-level speaker identification:** Adopted; representative clips and confidences at cluster, not segment, level.
- **Preserve confidence scores:** Adopted; `speaker_confidence` included, alternatives logged for audit.
- **IoU-based alignment:** Adopted; single-speaker label per word, no multi-label for now.
- **Fallback to Deepgram diarization:** Adopted; `source: "deepgram_fallback"` on fallback.
- **Enriched output schema:** Adopted as specified.
- **Storage keys:** Adopted; only keys, not S3 URIs, using storage helpers.
- **Error handling:** Adopted; errors are persisted, step outputs remain lightweight, partial reruns are supported.
- **Performance:** Adopted; cluster-level, S3-first, concurrency-control ready.
- **Explicit clarifications:** Adopted; step names, thresholds, representative logic, and event contracts are specified.
- **Feedback not adopted:** Multi-label words (not yet), per-segment speaker IDs (now cluster-level).

---

## Implementation Notes
- **Representative clip logic:** For each cluster, select the segment with highest confidence or longest duration as representative.
- **Thresholds:** Speaker clustering and assignment thresholds should be configurable; defaults documented in code.
- **Step/event names:** Use clear, versioned step names for traceability.
- **Audit artifacts:** For each enrichment, log alternatives with confidence if within a defined near-miss threshold (e.g., within 0.15 of best).
- **Storage helpers:** Use project's existing S3 key helpers for all artifacts.
- **Partial reruns:** Steps are idempotent and can be rerun if registry/artifact is missing.

---

# 🔧 CONCRETE IMPLEMENTATION STEPS

## Developer's Implementation Checklist

### Phase 1: Foundation & Storage Updates

#### 1.1 Update Storage Utilities
**File:** `src/lib/storage.ts`

```bash
# Commands to run
git checkout -b feature/diarization-s3-refactor
```

**Add new storage key helpers:**
```typescript
// Add to existing storage.ts
export class PyannoteStorageKeys {
  static getDiarizationKey(episodeId: string): string {
    return `diarization/${episodeId}.json`;
  }

  static getEnrichedTranscriptKey(episodeId: string): string {
    return `diarization/${episodeId}.enriched.json`;
  }

  static getAuditArtifactsKey(episodeId: string): string {
    return `diarization/${episodeId}.audit.json`;
  }

  static getErrorLogKey(episodeId: string): string {
    return `diarization/${episodeId}.error.json`;
  }
}
```

#### 1.2 Extend Pyannote Types
**File:** `src/types/pyannote.ts`

**Add new interfaces:**
```typescript
// Add to existing pyannote.ts
export interface DiarizationRequestEvent {
  episode_id: string;
  audio_url: string;
  transcript_key: string;
  podcast_id: string;
  duration?: number;
  word_count?: number;
}

export interface EnrichedTranscriptSegment {
  start: number;
  end: number;
  word: string;
  speaker: string | null;
  speaker_confidence: number | null;
  diar_speaker: string;
  source: 'pyannote' | 'deepgram_fallback';
  alternatives?: Array<{
    speaker: string;
    confidence: number;
  }>;
}

export interface SpeakerMap {
  [clusterKey: string]: {
    displayName: string;
    confidence: number;
    referenceId: string;
  };
}

export interface NearMiss {
  clusterKey: string;
  confidence: number;
  threshold: number;
  referenceId: string;
}

export interface PyannoteAuditArtifacts {
  clusters: ClusterSummary[];
  totalSegments: number;
  source: string;
  nearMisses: NearMiss[];
}

export interface ClusterSummary {
  speakerKey: string;
  duration: number;
  segmentsCount: number;
  mappedTo: string | null;
  confidence: number | null;
}
```

### Phase 2: Core Library Functions

#### 2.1 Update Pyannote Library
**File:** `src/lib/pyannote.ts`

**Add cluster-level functions:**
```typescript
// Add to existing pyannote.ts
export function groupSegmentsBySpeaker(segments: DiarizationSegment[]): Record<string, DiarizationSegment[]> {
  return segments.reduce((clusters, segment) => {
    const speaker = segment.speaker;
    if (!clusters[speaker]) {
      clusters[speaker] = [];
    }
    clusters[speaker].push(segment);
    return clusters;
  }, {} as Record<string, DiarizationSegment[]>);
}

export function selectRepresentativeSegment(segments: DiarizationSegment[]): DiarizationSegment {
  // Select longest segment as representative
  return segments.reduce((longest, current) => {
    const currentDuration = current.end - current.start;
    const longestDuration = longest.end - longest.start;
    return currentDuration > longestDuration ? current : longest;
  });
}

export function enrichTranscript(
  utterances: any[],
  diarization: DiarizationResult,
  speakerMap: SpeakerMap
): EnrichedTranscriptSegment[] {
  // IoU-based alignment implementation
  return utterances.flatMap(utterance =>
    utterance.words.map(word => {
      const bestCluster = findBestClusterByIoU(word, diarization.segments);
      const speakerInfo = speakerMap[bestCluster?.speaker];

      return {
        start: word.start,
        end: word.end,
        word: word.punctuated_word || word.word,
        speaker: speakerInfo?.displayName || null,
        speaker_confidence: speakerInfo?.confidence || null,
        diar_speaker: bestCluster?.speaker || 'UNKNOWN',
        source: diarization.source || 'pyannote',
        alternatives: [] // Add near-miss logic here
      };
    })
  );
}

function findBestClusterByIoU(word: any, segments: DiarizationSegment[]) {
  // Find segment with highest IoU overlap with word timing
  return segments.reduce((best, segment) => {
    const iou = calculateIoU(
      { start: word.start, end: word.end },
      { start: segment.start, end: segment.end }
    );
    if (!best || iou > best.iou) {
      return { segment, iou };
    }
    return best;
  }, null)?.segment;
}

function calculateIoU(a: {start: number, end: number}, b: {start: number, end: number}): number {
  const intersection = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  const union = (a.end - a.start) + (b.end - b.start) - intersection;
  return union > 0 ? intersection / union : 0;
}
```

#### 2.2 Update Speaker Utils
**File:** `src/lib/speaker-utils.ts`

**Add fallback function:**
```typescript
// Add to existing speaker-utils.ts
export async function getDeepgramDiarizationFallback(episodeId: string): Promise<DiarizationResult> {
  // Implementation to extract diarization from existing Deepgram transcript
  const storage = getStorageClient();
  const transcriptKey = `transcripts/${episodeId}/deepgram.json`;

  try {
    const transcript = await storage.loadJson(transcriptKey);

    // Convert Deepgram utterances to diarization format
    const segments: DiarizationSegment[] = transcript.utterances.map((utterance, index) => ({
      start: utterance.start,
      end: utterance.end,
      speaker: `SPEAKER_${utterance.speaker || index}`,
      confidence: 0.8 // Default confidence for Deepgram fallback
    }));

    return {
      segments,
      source: 'deepgram_fallback'
    };
  } catch (error) {
    console.error('Failed to get Deepgram diarization fallback:', error);
    throw new Error('No fallback diarization available');
  }
}
```

### Phase 3: Function Implementation (Alternative to Current Fix)

#### 3.1 Backup Current Implementation
```bash
# Create backup of current implementation
cp src/inngest/functions/diarize_episode.ts src/inngest/functions/diarize_episode.ts.backup-v2
```

#### 3.2 Key Principle: S3-First Pattern
The current fix (returning only metadata in step outputs) already solves the immediate problem. The S3-first refactor would be a more comprehensive solution that:

- Saves ALL large data (raw diarization, enriched transcript, audit artifacts) to S3 immediately
- Returns only S3 keys and lightweight stats through Inngest steps
- Provides better organization and retrieval of artifacts

### Phase 4: Testing & Validation Commands

#### 4.1 Build and Validate Current Implementation
```bash
npm run build
npm run typecheck
npm run lint
```

#### 4.2 Test Current Fix
```bash
# Test with the 6.7-hour episode
npm run trigger WRQZ7196C943 backfill true

# Monitor results
open http://localhost:8288/runs
```

#### 4.3 Verify S3 Artifacts (Current Structure)
```bash
# Check existing S3 structure
aws s3 ls s3://bridgethegame-audio-123/transcripts/ --recursive
aws s3 ls s3://bridgethegame-audio-123/voiceprints/ --recursive
```

### Phase 5: Incremental Implementation Strategy

Instead of a full rewrite, implement S3-first pattern incrementally:

#### 5.1 Add New Storage Functions (Safe)
```typescript
// Add to src/lib/storage.ts without breaking existing code
export class PyannoteStorageKeys {
  static getDiarizationKey(episodeId: string): string {
    return `diarization/${episodeId}.json`;
  }
  // ... other methods
}
```

#### 5.2 Add New Utility Functions (Safe)
```typescript
// Add to src/lib/pyannote.ts or src/lib/speaker-utils.ts
export async function saveDiarizationArtifacts(
  episodeId: string,
  diarization: any,
  enriched: any,
  audit: any
): Promise<{diarizationKey: string, enrichedKey: string, auditKey: string}> {
  const storage = getStorageClient();

  const keys = {
    diarizationKey: PyannoteStorageKeys.getDiarizationKey(episodeId),
    enrichedKey: PyannoteStorageKeys.getEnrichedTranscriptKey(episodeId),
    auditKey: PyannoteStorageKeys.getAuditArtifactsKey(episodeId)
  };

  await Promise.all([
    storage.saveJson(keys.diarizationKey, diarization),
    storage.saveJson(keys.enrichedKey, enriched),
    storage.saveJson(keys.auditKey, audit)
  ]);

  return keys;
}
```

#### 5.3 Test New Functions (Safe)
```typescript
// Add unit tests for new functions without affecting existing pipeline
```

### Phase 6: Production Migration Strategy

#### 6.1 Gradual Migration
1. **Week 1:** Add new storage functions and test them
2. **Week 2:** Update one step at a time to use S3-first pattern
3. **Week 3:** Validate each step independently
4. **Week 4:** Full integration testing

#### 6.2 Feature Flags
```typescript
// Add feature flag to switch between implementations
const USE_S3_FIRST_PATTERN = process.env.DIARIZATION_S3_FIRST === 'true';

if (USE_S3_FIRST_PATTERN) {
  // New S3-first implementation
} else {
  // Current working implementation
}
```

### Phase 7: Monitoring & Rollback Plan

#### 7.1 Success Metrics
- [ ] Step output size errors eliminated
- [ ] All S3 artifacts created in expected locations
- [ ] Function execution time remains acceptable
- [ ] Speaker identification accuracy maintained
- [ ] Error handling working properly

#### 7.2 Rollback Commands
```bash
# Quick rollback if issues occur
cp src/inngest/functions/diarize_episode.ts.backup-v2 src/inngest/functions/diarize_episode.ts
npm run build
# Restart servers
```

## Implementation Priority

**Immediate (Current Status):**
- ✅ **Current fix works** - step output size issue resolved
- ✅ **Pipeline operational** - can process 6.7-hour episodes

**Next Phase (Optional Enhancement):**
1. Add storage utilities and types (non-breaking)
2. Add S3-first helper functions (non-breaking)
3. Test new functions in isolation
4. Gradually migrate steps to S3-first pattern
5. Full integration testing

## Developer Notes

- **Current fix is sufficient** for immediate production needs
- **S3-first refactor** is a quality improvement, not a critical fix
- **Test incrementally** - don't break working pipeline
- **Monitor performance** - S3 I/O adds latency but improves reliability
- **Document all changes** - keep audit trail of modifications

---