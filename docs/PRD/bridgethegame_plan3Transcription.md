# Step 3 PRD: Deepgram Transcription Service

## Title

**Step 3: Automated Speech Recognition (ASR) via Deepgram**

## Objective

Transcribe podcast episode audio using Deepgram ASR, generating a structured JSON transcript with word-level timestamps. This transcript will be used for downstream diarization and alignment (to be implemented in later steps).

## Scope

- **In scope:** Sending audio to Deepgram, receiving and parsing transcription, storing results in S3 and/or DB, and producing a JSON envelope with required fields for later alignment and diarization.
- **Out of scope:** Speaker diarization, utterance segmentation, and alignment using pyannote (handled in subsequent steps).

## Architecture Overview

1. Inngest function is triggered when an audio file is ready for transcription.
2. The function fetches the audio file (from S3 or equivalent storage).
3. The function calls Deepgram API with appropriate parameters.
4. The function parses Deepgram's response into a normalized JSON envelope.
5. The function stores the JSON output in S3 (with defined naming convention) and/or updates the database.
6. The JSON is structured to facilitate future alignment and diarization steps.

## Deepgram API Parameters

- `model`: `"general"` (or configurable)
- `punctuate`: `true`
- `diarize`: `false` _(Diarization handled later via pyannote)_
- `utterances`: `true`
- `paragraphs`: `true`
- `filler_words`: `false`
- `profanity_filter`: `false`
- `language`: `"en"` (or auto-detect)
- `timestamps`: `true` _(critical for alignment)_

**Example cURL:**

```bash
curl \
  -X POST "https://api.deepgram.com/v1/listen" \
  -H "Authorization: Token $DEEPGRAM_API_KEY" \
  -H "Content-Type: audio/wav" \
  --data-binary "@episode_123.wav" \
  -d '{"punctuate":true,"utterances":true,"paragraphs":true,"timestamps":true,"diarize":false}'
```

## Input/Output Data Contract

### Input:

- `episode_id` (string): Unique identifier for the episode.
- `audio_url` or S3 key: Path to audio file.

### Output:

- JSON envelope with the following structure:

```json
{
  "episode_id": "string",
  "asr_provider": "deepgram",
  "raw": { ... }, // Full Deepgram API response (for traceability)
  "words": [
    {
      "word": "string",
      "start": float,
      "end": float,
      "confidence": float,
      "speaker": null // (to be filled in later, keep as null)
    },
    ...
  ],
  "utterances": [
    {
      "start": float,
      "end": float,
      "text": "string",
      "words": [ ...indices or objects... ],
      "speaker": null // (to be filled in later)
    },
    ...
  ],
  "paragraphs": [
    {
      "start": float,
      "end": float,
      "text": "string",
      "utterances": [ ...indices or objects... ]
    },
    ...
  ]
}
```

**Notes:**

- All `speaker` fields are `null` at this stage.
- `words`, `utterances`, and `paragraphs` must preserve start/end timestamps for each unit.
- The `raw` field stores the unmodified Deepgram API response for future reference.

## Inngest Function Requirements

- Trigger: New audio file ready event (or manual invocation for testing).
- Fetch audio from storage.
- Call Deepgram API with correct parameters.
- Parse and normalize output into required JSON envelope.
- Store JSON in S3 at:
  - `transcripts/{episode_id}/deepgram.json`
- Emit event or update DB to signal transcript availability.
- Log errors and retry on transient failures.

## Storage & File Naming

- Store the normalized JSON at: `transcripts/{episode_id}/deepgram.json`
- Store the raw Deepgram API response (optional) at: `transcripts/{episode_id}/deepgram_raw.json`
- Ensure idempotency: overwriting is allowed, but log each operation.

## Edge Cases & Error Handling

- **Audio missing/unavailable:** Log and raise error; do not proceed.
- **Deepgram API failure:** Retry with exponential backoff; log error if permanent failure.
- **Partial transcripts:** If Deepgram returns partial results, mark transcript as incomplete.
- **Malformed Deepgram response:** Log and skip; alert for manual review.
- **Large files:** Ensure timeout and chunking limits are respected.
- **Non-English audio:** Warn if detected (for future language handling).

## Future Integration Notes

- **Diarization:** Speaker attribution (`speaker` fields) will be populated by pyannote in the next step.
- **Alignment:** Word-level timestamps must be preserved exactly for forced alignment and diarization.
- **Extensibility:** Envelope structure must be compatible with additional ASR providers.
- **Versioning:** Consider adding a `schema_version` field in future iterations.

## Pseudocode Example

```python
def transcribe_episode(episode_id, audio_url):
    audio = fetch_audio(audio_url)
    response = deepgram_transcribe(audio, params={
        "punctuate": True,
        "utterances": True,
        "paragraphs": True,
        "timestamps": True,
        "diarize": False
    })
    envelope = {
        "episode_id": episode_id,
        "asr_provider": "deepgram",
        "raw": response,
        "words": extract_words(response),
        "utterances": extract_utterances(response),
        "paragraphs": extract_paragraphs(response)
    }
    save_to_s3(f"transcripts/{episode_id}/deepgram.json", envelope)
    return envelope
```

---
