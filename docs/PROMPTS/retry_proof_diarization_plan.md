# Retry-Proof Diarization Plan (Stateless, Simple, and Tough-as-Nails)

> **Problem (kid-simple):**  
> The pipeline runs fine the first time, but when Inngest retries a step it forgets what was in memory. Later code looks for that missing data and crashes because we didn’t reload it from S3.

> **Fix (kid-simple):**  
> Each step reloads what it needs from S3 every time, so retries always start fresh. We add safety checks and fallback values so the pipeline keeps running even if some data is missing.

---

## Goals

1. **Never depend on in-memory state across steps or retries.**  
   Every step rehydrates from S3 (or other storage) at the top.
2. **Keep step outputs tiny.**  
   Return only keys + small stats (the S3-first pattern).
3. **Bulletproof against “undefined” crashes.**  
   Guard every `Object.entries(...)`, `.map(...)`, etc., with “is this real?” checks.
4. **Be idempotent.**  
   Retrying a step never corrupts data and doesn’t duplicate outputs.
5. **Be observable.**  
   Structured logs + an end-to-end harness that only passes when Inngest says **Completed**.

---

## Canonical Storage Keys (deterministic, idempotent)

Use **keys, not URLs**, everywhere:

```
diarization/<episodeId>/pyannote_raw.json
diarization/<episodeId>/speaker_map.json
diarization/<episodeId>/near_misses.json
diarization/<episodeId>/enriched.json
transcripts/<episodeId>/deepgram.json
```

Single source of truth for paths:

```ts
// src/lib/keys.ts
export const keys = {
  diarizationRaw: (id: string) => `diarization/${id}/pyannote_raw.json`,
  speakerMap:     (id: string) => `diarization/${id}/speaker_map.json`,
  nearMisses:     (id: string) => `diarization/${id}/near_misses.json`,
  enriched:       (id: string) => `diarization/${id}/enriched.json`,
  transcript:     (id: string) => `transcripts/${id}/deepgram.json`,
};
```

---

## Safe Storage Helpers (rehydrate every time)

```ts
// src/lib/storage_safe.ts
import { loadJson, saveJson } from "@/lib/storage"; // your existing thin S3 client

export async function mustLoadJson<T>(key: string, what: string): Promise<T> {
  const data = await loadJson<T>(key);
  if (data == null) {
    throw new Error(`Missing required ${what} at ${key}`);
  }
  return data;
}

export async function tryLoadJson<T>(key: string): Promise<T | null> {
  try { return await loadJson<T>(key); } catch { return null; }
}
```

---

## Guard Utilities (no more “Object of null”)

```ts
// src/lib/guards.ts
export function ensureObject<T extends object>(v: unknown, name: string): T {
  if (v == null || typeof v !== "object") {
    throw new Error(`Expected object for ${name}, got ${typeof v}`);
  }
  return v as T;
}

export function ensureArray<T>(v: unknown, name: string): T[] {
  if (!Array.isArray(v)) {
    throw new Error(`Expected array for ${name}`);
  }
  return v as T[];
}
```

---

## Tiny Step Outputs (enforced)

```ts
// src/lib/safe_step_output.ts
import { saveJson } from "@/lib/storage";

const MAX_SIZE = 100 * 1024; // keep very small
export async function safeStepOutput<T>(
  key: string,
  payload: T,
  metadata: Record<string, unknown> = {}
) {
  const raw = JSON.stringify(payload);
  if (Buffer.byteLength(raw) > MAX_SIZE) {
    await saveJson(key, payload);
    return { storage_key: key, metadata, size: raw.length };
  }
  // Even if it's small, prefer writing to storage for consistency
  await saveJson(key, payload);
  return { storage_key: key, metadata, size: raw.length };
}
```

*Rule of thumb:* **Always** write big data to storage. **Never** return arrays or large objects in step results.

---

## Stateless Inngest Flow (every step rehydrates)

**Trigger:** `episode.transcribed.deepgram.completed`  
**Inputs:** `{ episode_id, podcast_id, audio_url, transcript_key }`

### Step 1 — Diarize (Pyannote Precision-2)

- **Rehydrate first:** (nothing needed besides inputs)
- **Do work:** call Pyannote → get raw diarization.
- **Persist:** `keys.diarizationRaw(id)`.
- **Return:** `{ episode_id, diarization_key, stats: { segments, duration } }`

```ts
const diarizationKey = keys.diarizationRaw(episode_id);

await step.run("pyannote-diarize", async () => {
  const raw = await pyannote.diarize(audio_url, process.env.PYANNOTE_API_KEY!);
  return safeStepOutput(diarizationKey, raw, {
    segments: raw?.segments?.length ?? 0
  });
});
```

**Fallback:** If Pyannote fails, later steps will use Deepgram speakers (see Step 3).

---

### Step 2 — Identify Speakers (by cluster, stateless)

- **Rehydrate:** `raw = await mustLoadJson(diarizationKey, "diarization")`
- **Cluster once, identify once per cluster** using a representative clip.
- **Persist:** 
  - `keys.speakerMap(id)` = `{ diarKey: SPEAKER_0 → "Alex Hormozi", confidence, refId }`
  - `keys.nearMisses(id)` = `[ { clusterKey, threshold, confidence, refId } ]`
- **Return:** `{ episode_id, speaker_map_key, near_misses_key, stats }`

```ts
const raw = await mustLoadJson<Diarization>(diarizationKey, "diarization");
const clusters = groupBySpeaker(raw.segments); // returns { SPEAKER_0: [..], ... }
const { map, nearMisses } = await identifyClusters(clusters, registry);

await saveJson(keys.speakerMap(episode_id), map);
await saveJson(keys.nearMisses(episode_id), nearMisses);

return {
  episode_id,
  speaker_map_key: keys.speakerMap(episode_id),
  near_misses_key: keys.nearMisses(episode_id),
  stats: { identified: Object.keys(map).length, near_misses: nearMisses.length }
};
```

> **Why cluster-level?** Fewer API calls, faster, and exactly what we need to label the whole group.

---

### Step 3 — Enrich Transcript (IoU merge, stateless, fallback-aware)

- **Rehydrate:**  
  - `transcript = await mustLoadJson(keys.transcript(id), "transcript")`  
  - Try `raw` diarization; if missing, **fallback** to Deepgram speakers sidecar.  
  - Try `speakerMap`; if missing, use empty `{}` (generic labels).
- **Merge by IoU:** For each utterance, find best overlapping diarized segment; map to labeled speaker if available.
- **Persist:** `keys.enriched(id)`  
- **Return:** `{ episode_id, enriched_key, stats }`

```ts
const transcript = await mustLoadJson<Transcript>(keys.transcript(episode_id), "transcript");
const diar = await tryLoadJson<Diarization>(keys.diarizationRaw(episode_id));
const spkMap = await tryLoadJson<SpeakerMap>(keys.speakerMap(episode_id)) ?? {};

const enriched = diar
  ? enrichWithPyannote(transcript.utterances, diar, spkMap) // IoU logic
  : enrichWithDeepgramFallback(transcript, /* deepgram sidecar */);

await saveJson(keys.enriched(episode_id), enriched);

return {
  episode_id,
  enriched_key: keys.enriched(episode_id),
  stats: { segments: enriched.length, identified: countLabeled(enriched) }
};
```

**Important:**  
- **No multi-label words** for now. Keep it simple; pick the best IoU match.  
- Add `speaker_confidence` when a labeled match exists.  
- Add `source: "pyannote_precision2"` or `"deepgram_fallback"`.

---

## Output Schemas (lean)

**Speaker Map (saved only):**
```json
{
  "SPEAKER_0": { "label": "Alex Hormozi", "confidence": 0.92, "referenceId": "ref_hormozi" }
}
```

**Enriched Segment (saved only):**
```json
{
  "start": 12.34,
  "end": 14.02,
  "text": "Welcome back...",
  "speaker": "Alex Hormozi",
  "speaker_confidence": 0.92,
  "diar_speaker": "SPEAKER_0",
  "source": "pyannote_precision2"
}
```

**Step Results (returned to Inngest):**
```json
{
  "episode_id": "WRQZ7196C943",
  "enriched_key": "diarization/WRQZ7196C943/enriched.json",
  "stats": { "segments": 78011, "identified": 41123 }
}
```

---

## Safety Nets (no more undefined)

- **Before any `Object.entries(x)` / `x.map(...)`:**
  ```ts
  if (!x) { console.warn("Missing x, skipping."); return []; }
  ```
- **Near-miss logging** when confidence < threshold (but close).
- **Try/catch** each step; persist error JSON to `diarization/<id>/errors/<ts>.json`; continue with fallback where possible.

---

## Idempotency & Retries

- Deterministic keys → re-runs overwrite same object; safe.  
- **Stateless** steps → every retry starts by reloading; safe.  
- Identification can skip work if `speaker_map.json` already exists (optional micro-opt).

---

## Testing & Proof

1. **Unit**  
   - IoU merge with fixtures.  
   - Identification chooses best match, logs near-misses.  
   - Guard functions throw on bad inputs.

2. **Retry Simulation (critical)**  
   - In a test, force a throw **after** diarization is saved but **before** identification finishes.  
   - Let Inngest retry the step; verify it rehydrates from storage and completes.

3. **Large Payload Torture**  
   - 6k segments diarization fixture → step results remain < 1 KB.  
   - Ensure enriched is only ever saved/loaded via storage, not returned.

4. **End-to-End Harness**  
   - `scripts/test_pipeline_end_to_end.ts` triggers a real episode and polls Inngest Runs API until **Completed** or fails loudly.

---

## Observability (so we trust it)

Structured logs (one line JSON):

```ts
log.info({
  scope: "diarize_episode",
  step: "cluster-speaker-identification",
  action: "reload_from_storage",
  episode_id,
  diarization_key: keys.diarizationRaw(episode_id),
  segments: raw?.segments?.length ?? 0
});
```

Metrics to eyeball:
- Percent runs that hit fallback
- Near-miss count per episode
- Average segments labeled
- Average step output size (should be tiny)
- End-to-end success rate

---

## “Line 230” Crash (what to fix immediately)

The stack shows `Object.entries(...)` on a `null|undefined`. Wrap it:

```ts
const entries = Object.entries(speakerMap ?? {});
for (const [clusterKey, info] of entries) {
  if (!info) continue;
  // ...
}
```

Or stricter:

```ts
const map = ensureObject<SpeakerMap>(speakerMap, "speakerMap");
for (const [clusterKey, info] of Object.entries(map)) { /* ... */ }
```

---

## Rollout Plan

1. Land **keys.ts**, **storage_safe.ts**, **guards.ts**, **safe_step_output.ts**.  
2. Refactor **diarize_episode.ts** to stateless pattern (3 steps above).  
3. Add unit tests + retry simulation test.  
4. Add the **end-to-end harness** and run it; require “Completed” in Inngest UI.  
5. Tighten logs; document the flow.  
6. Celebrate with the most obnoxious Starbucks order you can pronounce.

---

## Acceptance Criteria (no wiggle room)

- Inngest Runs UI shows **Completed** for a full episode end-to-end at least 3 times in a row.  
- No step returns arrays or large JSON; all data > 100 KB lives in storage.  
- Retrying any single step (kill it mid-run) **still** completes successfully thanks to rehydration.  
- No `Object of null` / `Cannot read property 'segments' of undefined` anywhere.  
- Fallback path produces enriched JSON with `source: "deepgram_fallback"` when Pyannote is unavailable.

---

This plan trades cleverness for **certainty**: stateless steps, deterministic keys, tiny outputs, and loud guardrails. It’s the boring, reliable foundation you want before you start tuning thresholds and polishing UX.
