# Plan 3.5 – Raw Transcript Offloading

## Objective
Make Deepgram transcription scalable by saving the raw API response directly to S3 and only returning lightweight metadata and an S3 key to Inngest. This prevents `output_too_large` errors when processing very long podcast episodes (like the 6–7 hour stress test).

## Scope
**In scope:**
- Refactor the boundary between Deepgram API call and transcript parsing steps
- Save full Deepgram JSON response to S3 immediately after transcription
- Return only metadata + S3 reference through Inngest step returns
- Modify parse-transcript step to fetch raw JSON from S3 instead of receiving it directly
- Consolidate S3 saves to avoid duplication

**Out of scope:**
- Pyannote diarization (Step 4).
- Embeddings, semantic indexing, or search functionality.

## Current Architecture (Steps in transcribe_episode.ts)
1. **Step 1: fetch-audio** - Validates audio URL
2. **Step 2: deepgram-transcribe** - Calls Deepgram API, returns full response (PROBLEM: too large)
3. **Step 3: parse-transcript** - Parses response, returns summary only
4. **Step 4: save-transcript** - Saves both raw and normalized to S3
5. **Step 5: Send event** - Emits `episode.transcript.completed`

## New Architecture
1. **Step 1: fetch-audio** - Validates audio URL (unchanged)
2. **Step 2: deepgram-transcribe** - Modified:
   - Call Deepgram API
   - Save raw response to S3: `transcripts/{episode_id}/raw_transcript.json`
   - Return only: `{ s3_raw_key, request_id, duration, word_count, utterance_count }`
3. **Step 3: parse-and-save-transcript** - Modified:
   - Load raw JSON from S3 using `s3_raw_key` from Step 2
   - Parse into normalized envelope
   - Save normalized to S3: `transcripts/{episode_id}/transcript.json`
   - Return only: `{ word_count, utterance_count, paragraph_count, duration }`
   - Include rollback to delete raw if normalized save fails
4. **Step 4: Send event** - Emits `episode.transcript.completed` (unchanged)  

## Implementation Details

### Key Changes Required

1. **Step 2 (deepgram-transcribe):**
   - After line 163 (successful Deepgram response), add S3 save
   - Replace line 165 `return response` with metadata return
   - Handle S3 save errors appropriately

2. **Step 3 (parse-and-save-transcript):**
   - Accept `s3_raw_key` from Step 2's return value
   - Add S3 load at beginning to fetch raw response
   - Keep existing parse logic
   - Move normalized save here (currently in Step 4)
   - Remove dependency on closure variable `transcriptEnvelope`

3. **Step 4 (was save-transcript):**
   - Remove entirely - its functionality moves to Step 3
   - Renumber subsequent steps

4. **Error Handling:**
   - Step 2: If S3 save fails, throw error (Inngest will retry)
   - Step 3: If S3 load fails, throw error
   - Step 3: If normalized save fails, consider deleting raw (rollback)

### Data Flow
```
Step 2 output: { s3_raw_key, request_id, duration, word_count, utterance_count }
     ↓
Step 3 input: Uses s3_raw_key to load from S3
     ↓
Step 3 output: { word_count, utterance_count, paragraph_count, duration }
```

## Benefits
- Eliminates Inngest `output_too_large` failures for any episode length
- Keeps step outputs lightweight (KB, not MB)
- Establishes pattern: large blobs in S3, only metadata in Inngest
- Prepares pipeline for future heavy outputs (pyannote JSON, embeddings)
- Removes duplicate S3 saves (was happening in both Step 3 and 4)

## Risks & Mitigations
- **Risk:** S3 save in Step 2 could fail after Deepgram success
  - **Mitigation:** Inngest retry will re-call Deepgram (idempotent with force flag)
- **Risk:** Orphaned raw files if Step 3 fails permanently
  - **Mitigation:** Add cleanup job or TTL policy on raw files
- **Risk:** Breaking change to step interface
  - **Mitigation:** Test thoroughly with all episode lengths

## Validation
- Re-run stress test with episode WRQZ7196C943 (6.7 hours)
- Confirm pipeline completes without `output_too_large`
- Verify both raw and normalized JSON exist in S3
- Confirm Deepgram speaker sidecar preserved in normalized
- Test with short (30m) and medium (1h) episodes for regression

## Next Steps
1. Implement Step 2 and 3 changes
2. Remove old Step 4 (consolidate into Step 3)
3. Run validation tests across episode lengths
4. Update test scripts to check new data flow


## Decision Note

Following a thorough review by Claude Code, the updated plan (3.5) is confirmed to be more robust and production-ready. The changes address prior limitations with large Deepgram outputs by introducing a clear, step-by-step mapping of responsibilities and improving error handling throughout the process.

Key benefits of this revision include:
- **Clear step mapping:** Each pipeline step now has a distinct, well-defined role, minimizing overlap and potential confusion.
- **Merged Steps 3 and 4:** Consolidating parsing and saving into a single step streamlines the workflow and eliminates redundant S3 operations.
- **Closure variable fix:** The previous reliance on closure variables (such as `transcriptEnvelope`) is removed, reducing hidden state and side effects.
- **Explicit risk and validation detail:** The plan now specifies error handling, rollback strategies, and concrete validation scenarios, which will help ensure reliability under stress conditions.

This revision is not an example of overengineering; rather, it simplifies and hardens the pipeline to meet production standards and handle edge cases (such as very long episodes) gracefully. The inclusion of line-level implementation details is intentional. It reduces ambiguity during development, ensuring that the engineering team can proceed efficiently and with confidence in the intended design.

In summary, the plan is clearer, more maintainable, and better equipped for scale, with decisions grounded in practical production requirements.
