You are an AI coding partner. Implement **Step 3: Deepgram Transcription Service** as described in the following PRD:docs/PRD/bridgethegame_plan3Transcription.md

Treat this PRD as both the specification and the constraints.

---

## Objective

Build an Inngest function `episode.ingest.transcribe` that:

- Accepts `episode_id` and `audio_url`.
- Sends the audio file to Deepgram with the defined parameters.
- Normalizes the response into a JSON envelope.
- Stores the envelope and raw response in S3 (or equivalent).
- Emits an event / updates DB to signal transcript availability.

---

## Deepgram API Parameters

- `model="general"` (configurable)
- `punctuate=true`
- `utterances=true`
- `paragraphs=true`
- `timestamps=true`
- `diarize=false` (pyannote will handle diarization later)
- `filler_words=false`
- `profanity_filter=false`
- `language="en"` (default, or auto-detect)

**Example cURL:**

```bash
curl -X POST "https://api.deepgram.com/v1/listen" \
  -H "Authorization: Token $DEEPGRAM_API_KEY" \
  -H "Content-Type: audio/wav" \
  --data-binary "@episode_123.wav" \
  -d '{"punctuate":true,"utterances":true,"paragraphs":true,"timestamps":true,"diarize":false}'
```

---

## Input Contract

- `episode_id` (string)
- `audio_url` (string)

---

## Output Contract (JSON envelope)

```json
{
  "episode_id": "string",
  "asr_provider": "deepgram",
  "raw": { ... },
  "words": [
    {"word":"string","start":float,"end":float,"confidence":float,"speaker":null}
  ],
  "utterances": [
    {"start":float,"end":float,"text":"string","words":[...],"speaker":null}
  ],
  "paragraphs": [
    {"start":float,"end":float,"text":"string","utterances":[...]}
  ]
}
```

**Notes:**

- Preserve word-level timestamps.
- All `speaker` fields remain `null`.
- `raw` stores the full Deepgram response.

---

## Storage & File Naming

- `transcripts/{episode_id}/deepgram.json` → normalized envelope
- `transcripts/{episode_id}/deepgram_raw.json` → raw Deepgram response

---

## Requirements

- Idempotent: overwrite allowed, but log each run.
- Error handling: retry Deepgram API failures with exponential backoff.
- Handle large files and timeouts.
- Warn if language ≠ English.
- Mark transcripts as incomplete if Deepgram returns partials.

---

## Deliverables

1. Inngest function implementation.
2. Helper functions:
   - `fetch_audio(audio_url)`
   - `deepgram_transcribe(audio, params)`
   - `extract_words/utterances/paragraphs(response)`
   - `save_to_s3(path, obj)`
3. Example unit tests for parsing and envelope shape.
4. Example cURL for manual debugging.

---

## Pseudocode Reference

```python
def transcribe_episode(episode_id, audio_url):
    audio = fetch_audio(audio_url)
    response = deepgram_transcribe(audio, params={...})
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
