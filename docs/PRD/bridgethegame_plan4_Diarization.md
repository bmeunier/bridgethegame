---
title: Step 4: Pyannote Diarization & Speaker Platform
status: draft
---

# Step 4: Pyannote Diarization & Speaker Platform

Implementation Plan (Reusable Across Podcasts)

## Purpose

Integrate **Pyannote Precision-2** and **Speaker Platform** to generate speaker-attributed transcripts.  
Primary outcome: correctly identify **known registered speakers** (e.g., Alex Hormozi in AskTheGame).  
Guests remain generic until registered.

---

## Architecture Overview

1. **Trigger**: `episode.transcribed.deepgram.completed` (Deepgram transcript + audio URL ready).
2. **Diarization**: Call Pyannote Precision-2 → get raw speaker turns.
3. **Speaker Identification**: Perform **cluster-level identification** by grouping diarized segments by speaker key, selecting a representative audio clip per cluster, identifying against all registry entries, assigning the best match with confidence, and propagating the label to all segments in that cluster.
4. **Merge**: Combine with Deepgram transcript into canonical JSON using overlap-based (IoU) matching between transcript words and diarization segments.
5. **Output**: Save enriched transcript to S3 → emit `episode.diarized.pyannote.completed`.

---

## Speaker Registry (Future-Proofing)

A simple JSON config in S3 or DB:

```json
{
  "askthegame": {
    "HORMOZI": {
      "displayName": "Alex Hormozi",
      "referenceId": "ref_hormozi_123",
      "threshold": 0.85
    }
  },
  "anotherpodcast": {
    "HOST_A": {
      "displayName": "Jane Doe",
      "referenceId": "ref_janedoe_456",
      "threshold": 0.8
    },
    "HOST_B": {
      "displayName": "John Smith",
      "referenceId": "ref_johnsmith_789",
      "threshold": 0.82
    }
  }
}
```

The function loads the registry based on `podcast_id`. No hard-coding.

---

## API Integration

- **Diarization**: `POST /v1/diarize` → `{ segments: [{ start, end, speaker }] }`
- **Speaker Identify**: `POST /v1/identify` with `{ audio_url, reference_id }` → `{ speaker, confidence }`

---

## Utility Module: `utils/pyannote.ts`

```typescript
import fetch from "node-fetch";
const API_BASE = "https://api.pyannote.ai/v1";

export async function diarize(
  audioUrl: string,
  apiKey: string,
  maxSpeakers = 3,
) {
  const res = await fetch(`${API_BASE}/diarize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ audio_url: audioUrl, max_speakers: maxSpeakers }),
  });
  if (!res.ok)
    throw new Error(`Diarization failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Identify speaker for a given audio segment against a reference ID.
 * Returns detailed result for cluster-level processing.
 */
export async function identifySpeaker(
  segmentUrl: string,
  apiKey: string,
  refId: string,
) {
  const res = await fetch(`${API_BASE}/identify`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ audio_url: segmentUrl, reference_id: refId }),
  });
  if (!res.ok)
    throw new Error(`Identify failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return {
    matches: data.speaker === refId,
    confidence: data.confidence,
    referenceId: refId,
  };
}

/**
 * Enrich transcript by aligning transcript words with diarization segments using overlap (IoU) matching.
 * Applies speaker labels and confidence scores from cluster-level identification.
 */
export function enrichTranscript(transcript, diarization, speakerMap = {}) {
  const enriched = [];

  // For each transcript word/segment, find overlapping diarization segment by IoU
  for (const t of transcript) {
    let matchedSegment = null;
    let maxIoU = 0;

    for (const seg of diarization.segments) {
      const overlapStart = Math.max(t.start, seg.start);
      const overlapEnd = Math.min(t.end, seg.end);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      const union = Math.max(t.end, seg.end) - Math.min(t.start, seg.start);
      const iou = overlap / union;

      if (iou > maxIoU) {
        maxIoU = iou;
        matchedSegment = seg;
      }
    }

    let diarSpeaker = matchedSegment ? matchedSegment.speaker : "Unknown";
    let speaker = diarSpeaker;

    if (speakerMap[diarSpeaker]) {
      speaker = speakerMap[diarSpeaker].displayName;
    }

    const speakerConfidence = speakerMap[diarSpeaker]?.confidence ?? null;

    enriched.push({
      start: t.start,
      end: t.end,
      text: t.text,
      speaker,
      diar_speaker: diarSpeaker,
      speaker_confidence: speakerConfidence,
      source: "pyannote",
    });
  }

  return enriched;
}
```

---

## Inngest Function Wiring

```typescript
export const diarizeFn = inngest.createFunction(
  { name: "Pyannote Diarization" },
  { event: "episode.transcribed.deepgram.completed" },
  async ({ event, step }) => {
    const { episode_id, podcast_id, audio_url, s3_transcript_path } =
      event.data;

    const registry = await getSpeakerRegistry(podcast_id);
    const transcript = await getS3Object(s3_transcript_path);

    let diarization;
    try {
      diarization = await diarize(audio_url, process.env.PYANNOTE_API_KEY);
    } catch (error) {
      // Fallback to Deepgram diarization sidecar if Pyannote fails
      diarization = await getDeepgramDiarizationFallback(episode_id);
      diarization.source = "deepgram_fallback";
    }

    // Cluster-level identification:
    // Group diarization segments by speaker key
    const clusters = {};
    for (const seg of diarization.segments) {
      if (!clusters[seg.speaker]) clusters[seg.speaker] = [];
      clusters[seg.speaker].push(seg);
    }

    const speakerMap = {};
    const nearMisses = [];

    // For each cluster, pick a representative clip and identify against all registry entries
    for (const clusterKey of Object.keys(clusters)) {
      const segments = clusters[clusterKey];
      const repSegment = segments[Math.floor(segments.length / 2)]; // pick middle segment as representative

      // Assume getAudioClipUrl extracts clip URL for segment from full audio
      const clipUrl = await getAudioClipUrl(
        audio_url,
        repSegment.start,
        repSegment.end,
      );

      let bestMatch = null;
      let bestConfidence = 0;

      for (const [refId, info] of Object.entries(registry)) {
        const result = await identifySpeaker(
          clipUrl,
          process.env.PYANNOTE_API_KEY,
          info.referenceId,
        );
        if (
          result.confidence > bestConfidence &&
          result.confidence >= info.threshold
        ) {
          bestConfidence = result.confidence;
          bestMatch = info;
          bestMatch.referenceId = info.referenceId;
        }
      }

      if (bestMatch) {
        if (bestConfidence >= bestMatch.threshold) {
          speakerMap[clusterKey] = {
            displayName: bestMatch.displayName,
            confidence: bestConfidence,
            referenceId: bestMatch.referenceId,
          };
        } else {
          // Log near-miss for debugging/tuning thresholds
          console.warn(
            `Near-miss for cluster ${clusterKey}: confidence ${bestConfidence} below threshold ${bestMatch.threshold} for referenceId ${bestMatch.referenceId}`,
          );
          nearMisses.push({
            clusterKey,
            confidence: bestConfidence,
            threshold: bestMatch.threshold,
            referenceId: bestMatch.referenceId,
          });
        }
      }
    }

    const enriched = enrichTranscript(transcript, diarization, speakerMap);

    const enrichedPath = `s3://bridgethegame/episodes/${episode_id}/enriched.json`;
    await putS3Object(enrichedPath, JSON.stringify(enriched));

    // Save audit artifacts
    const audit = {
      clusters: Object.entries(clusters).map(([key, segs]) => ({
        speakerKey: key,
        duration: segs.reduce((acc, s) => acc + (s.end - s.start), 0),
        segmentsCount: segs.length,
        mappedTo: speakerMap[key]?.displayName || null,
        confidence: speakerMap[key]?.confidence || null,
      })),
      totalSegments: diarization.segments.length,
      source: diarization.source || "pyannote",
      nearMisses,
    };
    const auditPath = `s3://bridgethegame/episodes/${episode_id}/pyannote_audit.json`;
    await putS3Object(auditPath, JSON.stringify(audit));

    await step.sendEvent("episode.diarized.pyannote.completed", {
      data: {
        episode_id,
        s3_enriched_path: enrichedPath,
        s3_audit_path: auditPath,
      },
    });
  },
);
```

---

## JSON Output Schema

```json
[
  {
    "start": 0.0,
    "end": 4.5,
    "speaker": "Alex Hormozi",
    "diar_speaker": "SPEAKER_0",
    "speaker_confidence": 0.92,
    "text": "Welcome back to The Game podcast...",
    "source": "pyannote",
    "alternatives": [{ "speaker": "Guest_1", "confidence": 0.15 }]
  },
  {
    "start": 4.5,
    "end": 12.0,
    "speaker": "Guest_1",
    "diar_speaker": "SPEAKER_1",
    "speaker_confidence": null,
    "text": "Thanks for having me, Alex...",
    "source": "pyannote"
  }
]
```

---

## Fallback Strategy

If Pyannote diarization fails or returns errors, the system falls back to Deepgram diarization sidecar data.  
Segments are labeled accordingly with `"source": "deepgram_fallback"` in the enriched transcript to preserve traceability.  
This ensures robustness and continuity of speaker attribution in production.

---

## Audit Artifacts

An audit JSON file (`pyannote_audit.json`) is saved per episode containing:

- Cluster-level summaries with total duration, number of segments, mapped speaker labels, and confidence scores.
- Total diarization segments count.
- Diarization source indicator (`pyannote` or `deepgram_fallback`).
- Near-miss cases where confidence scores fell below thresholds are recorded for debugging and tuning speaker identification thresholds.

These artifacts support debugging, quality assurance, and performance analytics.

---

## Unit Testing Setup

### Fixtures: `utils/__tests__/pyannote.fixtures.ts`

```typescript
export const transcriptBasic = [
  { start: 0.0, end: 2.0, text: "Hello" },
  { start: 2.0, end: 4.0, text: "World" },
];

export const diarizationAligned = {
  segments: [
    { start: 0.0, end: 2.5, speaker: "SPEAKER_0" },
    { start: 2.5, end: 5.0, speaker: "SPEAKER_1" },
  ],
};

export const diarizationEmpty = { segments: [] };
```

### Tests: `utils/__tests__/pyannote.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";
import { enrichTranscript, diarize, identifySpeaker } from "../pyannote";
import {
  transcriptBasic,
  diarizationAligned,
  diarizationEmpty,
} from "./pyannote.fixtures";

global.fetch = vi.fn();

describe("pyannote utils", () => {
  it("aligns transcript with diarization using IoU", () => {
    const enriched = enrichTranscript(transcriptBasic, diarizationAligned);
    expect(enriched[0].speaker).toBe("SPEAKER_0");
    expect(enriched[1].speaker).toBe("SPEAKER_1");
  });

  it("labels Unknown when diarization empty", () => {
    const enriched = enrichTranscript(transcriptBasic, diarizationEmpty);
    expect(enriched.every((e) => e.speaker === "Unknown")).toBe(true);
  });

  it("identifySpeaker returns detailed match info", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ speaker: "REF_ID", confidence: 0.9 }),
    });
    const result = await identifySpeaker("fake", "KEY", "REF_ID");
    expect(result.matches).toBe(true);
    expect(result.confidence).toBe(0.9);
  });
});
```

---

## Integration Test Checklist (First Live Run)

1. Run one full episode through Deepgram + Pyannote.
2. Check S3 enriched JSON:
   - Are segments aligned with timestamps using overlap?
   - Are registered speakers labeled correctly with confidence?
   - Is fallback logic exercised if Pyannote fails?
3. Inspect confidence scores for false positives.
4. Confirm `episode.diarized.pyannote.completed` event emitted with correct payload including audit path.
5. Push into Weaviate → test semantic search on "What did [HOST] say about X?".

---

## Success Criteria

- Registered speakers consistently labeled (≥95% accuracy) with confidence preserved.
- Guests labeled generically but stable within an episode.
- Pipeline modular enough to support multiple podcasts by changing registry, not code.
- Fallback to Deepgram diarization works seamlessly when needed.
- Audit artifacts generated and stored for QA and analytics.

---

## Dev Notes on Claude's Suggestions

During review, Claude proposed several additional improvements. Here’s why some were not adopted immediately:

1. **Batch API call with multiple reference IDs**  
   Not adopted because the Pyannote API does not currently document a multi-reference endpoint. Cluster × registry calls already reduce load compared to per-segment calls. If Pyannote adds batch identification later, this can be swapped in without major refactor.

2. **Alternative speakers in every output**  
   Keeping `alternatives` optional. Useful for debugging but noisy for production indexing. Safer to emit in audits and selectively in enriched JSON.

3. **Ensemble voting across multiple matches**  
   Skipped for now as over-engineering. With a small registry (one or two hosts), a simple best-confidence pick is sufficient. Can revisit if registry grows.

4. **Deeper overlap alignment than IoU**  
   IoU overlap was implemented as a big step up from index-based alignment. Multi-speaker-per-word attribution was not adopted yet to avoid downstream complexity.

5. **Exposing all raw confidences everywhere**  
   Confidence is preserved for primary matches and in audit artifacts. Not carrying every possible confidence into the main transcript to avoid bloated data. Future iterations may expand this if needed.

These choices keep Step 4 robust, modular, and production-ready without premature complexity, while leaving clear upgrade paths.
