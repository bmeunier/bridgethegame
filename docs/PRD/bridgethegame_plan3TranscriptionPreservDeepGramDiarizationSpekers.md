

You are an AI coding partner. Review, rebuild, and retest the Step 3 implementation (Deepgram Transcription Service) with the following **addendum requirements**. This addendum extends the PRD and must be integrated without breaking the existing contract.

---

## Objective
Maintain the canonical transcript structure (`speaker: null`) for pyannote integration, but also **preserve Deepgram’s diarization output** as a *sidecar field* for optional debugging, analysis, and confidence ensembles.

---

## New Requirements

1. **Sidecar Field**
   - Add a top-level optional block in the normalized transcript envelope:
   ```json
   "deepgram_speakers": [
     {"start": 0.0, "end": 12.5, "speaker": "dg-0"},
     {"start": 12.5, "end": 24.0, "speaker": "dg-1"}
   ]
   ```

2. **Canonical Contract**
   - Keep all `speaker` fields inside `words`, `utterances`, and `paragraphs` as `null`.
   - Do not overwrite these with Deepgram’s diarization.

3. **Preserve Alignment**
   - Ensure word-level timestamps are unchanged.
   - `deepgram_speakers` must only reflect Deepgram’s segmentation metadata.

4. **Storage & Naming**
   - Keep storage conventions intact:
     - `deepgram.json` → normalized envelope (now with `deepgram_speakers` block).
     - `deepgram_raw.json` → unmodified Deepgram response.

5. **Testing & Validation**
   - Add unit tests to confirm:
     - `speaker` fields remain `null`.
     - `deepgram_speakers` is present and correctly mapped.
     - Sidecar data aligns with time boundaries in the raw Deepgram response.

---

## Deliverables
1. Update types (`TranscriptEnvelope`) to include optional `deepgram_speakers`.
2. Update parsing logic to populate this field from Deepgram response if diarization data is available.
3. Update test fixtures to assert the sidecar is saved.
4. Run full test suite again to validate changes (`npm run test`, `npm run test:transcribe`).

---

## Reminder
- The main pipeline remains unchanged for pyannote integration.
- `deepgram_speakers` is for **debugging and future confidence vectors only**.
- Document this behavior clearly in code comments and README.

---

## Action
Review the existing implementation, rebuild where necessary, integrate this addendum, and retest everything to ensure consistency and correctness.
