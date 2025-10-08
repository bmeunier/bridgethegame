# BridgeTheGame Runbook

## Overview

BridgeTheGame ingests podcast episodes from Podbean, transcribes audio with Deepgram, enriches the transcript with Pyannote speaker diarization, and archives the outputs in S3. The workflow is orchestrated with Inngest functions exposed through the local Express app in `src/inngest/index.ts`.

## Prerequisites

- Node.js 20.x (tsx relies on modern ESM support)
- npm 10.x
- Access to an AWS account with permission to read/write the target S3 bucket
- Credentials for the external services:
  - Podbean API (client id/secret and either access + refresh token or client credentials flow)
  - Deepgram API key
  - Pyannote API key (Precision model recommended)
- Optional: AWS CLI for quick sanity checks on the bucket

## Environment Configuration

Create a `.env` file in the project root (tests load `.env.test` if present):

```
# Core services
PODBEAN_CLIENT_ID=...
PODBEAN_CLIENT_SECRET=...
PODBEAN_ACCESS_TOKEN=...
PODBEAN_REFRESH_TOKEN=...
DEEPGRAM_API_KEY=...
PYANNOTE_API_KEY=...

# Storage
S3_BUCKET_NAME=...
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# App / tooling
PORT=3000
EXPRESS_BODY_LIMIT=100mb
INNGEST_NATIVE_LIMITS=false
TEST_EPISODE_ID_1=optional-demo-id
```

Environment variable reference:

| Variable                                     | Purpose                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| `PODBEAN_*`                                  | Authentication for fetching Podbean metadata and audio URLs            |
| `DEEPGRAM_API_KEY`                           | Required for Deepgram transcription API                                |
| `PYANNOTE_API_KEY`                           | Required for diarization and speaker identification                    |
| `S3_BUCKET_NAME`, `AWS_REGION`               | Destination bucket for transcripts, diarization artifacts, audio cache |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Only needed when not running with an attached IAM role                 |
| `PORT`, `EXPRESS_BODY_LIMIT`                 | Optional Express server configuration                                  |
| `INNGEST_NATIVE_LIMITS`                      | Feature flag for future built-in size checking (leave `false`)         |
| `TEST_EPISODE_ID_*`                          | Convenience IDs surfaced by `npm run trigger`                          |

## Install Dependencies

```bash
npm install
```

## Speaker Registry & Voiceprints

1. Populate `config/speaker-registry.json` with per-podcast speaker entries and sample audio locations.
2. Run `npx tsx scripts/setup_speaker_registry.ts` to generate Pyannote voiceprints and upload the registry (`speaker-registry/<podcast>.json`) and voiceprints (`voiceprints/profiles/<refId>.json`) to S3. The script converts S3 URIs to signed URLs automatically.

## Start the Pipeline Locally

1. **Express + Inngest handler:**
   ```bash
   npm run dev
   ```
2. **Inngest dev server:** (auto-downloads the CLI)
   ```bash
   npm run inngest-dev
   ```
   The dev UI will be at http://localhost:8288.

Keep both processes running in separate terminals. Structured JSON logs appear in the dev server terminal; additional logs go to `app_server.log` and `inngest_server.log` in the repo root when the CLI is running.

## Trigger an Ingestion Run

Use the CLI helper:

```bash
npm run trigger <episode_id> [mode] [force]
# example
npm run trigger XWPJS196C945 manual true
```

- `mode` defaults to `backfill`; accepted values: `backfill`, `manual`, `realtime`.
- `force=true` bypasses the transcript cache check.

Alternative harnesses:

- `npx tsx scripts/test_inngest_pipeline.ts <episode_id> [--force]` – triggers the event and polls for transcript completion.
- `npx tsx scripts/test_full_pipeline.ts <episode_id>` – asserts presence of Deepgram artifacts in S3 after the run.

### Event Flow

1. `podbean.episode.ingest.requested` → `ingestEpisode`
   - Fetches metadata via `PodbeanClient`
   - Emits `episode.transcribe.requested`
2. `episode.transcribe.requested` → `transcribeEpisode`
   - Calls Deepgram with the podcast audio URL
   - Saves raw and normalized transcripts under `transcripts/<episode>/`
   - Emits `episode.transcribed.deepgram.completed`
3. `episode.transcribed.deepgram.completed` → `diarizeEpisode`
   - Attempts Pyannote diarization (fallback to Deepgram segments)
   - Runs speaker identification using stored voiceprints
   - Saves enriched transcript & audit artifacts under `diarization/<episode>/`
   - Emits `episode.diarized.pyannote.completed`

## Output Locations (S3)

| Artifact                 | Key helper                                                  |
| ------------------------ | ----------------------------------------------------------- |
| Raw Deepgram payload     | `StorageClient.getTranscriptKey(episodeId, 'deepgram_raw')` |
| Normalized transcript    | `StorageClient.getTranscriptKey(episodeId, 'deepgram')`     |
| Audio cache (optional)   | `StorageClient.getAudioKey(episodeId)`                      |
| Pyannote raw diarization | `keys.diarizationRaw(episodeId)`                            |
| Speaker map              | `keys.speakerMap(episodeId)`                                |
| Near misses              | `keys.nearMisses(episodeId)`                                |
| Enriched transcript      | `keys.enriched(episodeId)`                                  |
| Audit summary            | `diarization/<episodeId>/audit.json`                        |

## Verifying Success

1. Visit the Inngest dev UI (Runs tab) to confirm each function completed.
2. Check S3 for the artifacts above (AWS CLI snippet: `aws s3 ls s3://$S3_BUCKET_NAME/transcripts/<episode>/`).
3. Run diagnostics:
   ```bash
   npx tsx scripts/check_pipeline_status.ts <episode_id>
   npx tsx scripts/check_raw_transcript.ts <episode_id>
   npx tsx scripts/debug_diarization.ts <episode_id>
   ```
   Update the scripts to pass a dynamic episode id where needed—the current versions still contain demo IDs.

## Debug & Maintenance Tips

- **Podbean auth issues:** `npx tsx scripts/debug_podbean_episodes.ts` prints token status and fetches sample listings.
- **Re-run a single Inngest function:** Re-trigger the relevant event with `force=true`. Cached transcripts are skipped unless forced.
- **Clear cached artifacts:** `npx tsx scripts/clear_episode_cache.ts <episode_id>` deletes audio + transcript keys from S3.
- **Speaker drift:** Inspect `speaker_map.json` and `near_misses.json` in S3; tweak registry thresholds or regenerate voiceprints.
- **Body size errors:** The Express server default limit is `100mb` (`EXPRESS_BODY_LIMIT`). Increase only if Deepgram returns larger JSON payloads.

## Automated Tests

```bash
npm test
```

Key suites:

- `tests/deepgram.test.ts` – envelope normalization
- `tests/diarization-retry.test.ts`, `tests/s3-first-torture.test.ts` – S3-first retry patterns
- `tests/inngest-step-output.test.ts`, `tests/fix-proof-simple.test.ts` – step output size guards

Use `npm run test:watch` or `npm run test:coverage` for iterative development. Tests load `.env.test`; ensure it contains stub credentials (`DEEPGRAM_API_KEY`, `S3_BUCKET_NAME`, etc.).

## Production Notes

- Rate limits: Deepgram requests are throttled to 10 per minute, diarization to 5 per minute via Inngest concurrency options.
- Long episodes: Body parser limit is configurable; transcripts for >3 hour episodes can exceed 50 MB.
- Future stages (Weaviate indexing) are placeholders—currently the pipeline stops after diarization.
