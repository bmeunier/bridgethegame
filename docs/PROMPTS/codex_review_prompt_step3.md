Review the following new and modified code added in Step 3 (Deepgram Transcription Service with sidecar diarization) for the **Bridge The Game** pipeline:

- `src/inngest/functions/transcribe_episode.ts`
- `src/lib/deepgram.ts`
- `src/lib/storage.ts` (new `deleteObject` method)
- `scripts/test_inngest_pipeline.ts`
- `scripts/debug_diarization.ts`
- `scripts/check_raw_transcript.ts`

---

## Review Focus

1. **Correctness & Robustness**
   - Is diarization (`diarize: true`) reliably passed to Deepgram?
   - Is the sidecar field `deepgram_speakers` populated correctly without touching canonical `speaker: null` fields?
   - Are edge cases (missing diarization data, empty audio, invalid URLs) handled safely?

2. **Error Handling**
   - Check retries, logging, and failure modes in `deepgram.ts` and `storage.ts`.
   - Does the new `deleteObject` method handle AWS errors cleanly?

3. **Security & Config**
   - Are secrets (`DEEPGRAM_API_KEY`, S3 credentials) handled safely?
   - Is dotenv loaded before clients are initialized?

4. **Scalability**
   - Will the pipeline work reliably at scale (many episodes, large audio files)?
   - Any potential memory issues in audio fetching, transcript parsing, or S3 writes?

5. **Code Style & Maintainability**
   - Is type safety enforced in new/changed TypeScript code?
   - Are comments clear, especially around why sidecar diarization exists?
   - Is the separation of concerns (fetching, transcribing, storing) clean?

---

## Deliverables

- Identify potential bugs, anti-patterns, or weak points.
- Suggest specific improvements (code structure, error handling, testing).
- Highlight any risks in integrating this into the broader Inngest pipeline.
