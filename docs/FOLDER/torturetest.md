# Stress Test Checklist – BridgeTheGame Pipeline

Goal: Validate pipeline stability and resilience under extreme inputs (e.g. 6–7 hour episodes).

## Pre-Test Setup
- [ ] Confirm `.env` includes correct `EXPRESS_BODY_LIMIT` (>=100mb).
- [ ] Verify S3 bucket credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`).
- [ ] Restart Express + Inngest servers (`npm run dev` + `inngest dev`).

## Test Runs
### Episode WRQZ7196C943 (6.7 hours – stress test case)
- [ ] Trigger `episode.ingest` with `--force`.
- [ ] Monitor Inngest dashboard for failures (`http://localhost:8288/runs`).
- [ ] Confirm transcript JSON saved fully to S3.
- [ ] Validate `deepgram_speakers` sidecar present in JSON.
- [ ] Check Inngest function returns summary only (word count, utterance count, duration).

### Medium Episode (~1 hour)
- [ ] Repeat pipeline run.
- [ ] Confirm no regressions from stress fix (summary + S3 intact).

### Small Episode (~30 minutes)
- [ ] Repeat pipeline run.
- [ ] Confirm behavior identical (summary + S3 intact).

## Observability & Metrics
- [ ] Record processing time for each episode size.
- [ ] Record transcript size in MB vs duration.
- [ ] Validate rollback works (simulate S3 failure).
- [ ] Confirm `episode.transcript.completed` event always emitted.

## Deliverables
- [ ] Test log for each episode.
- [ ] S3 JSON integrity check (open raw transcript).
- [ ] Final note: Pipeline stable for short, medium, and extreme-length episodes.