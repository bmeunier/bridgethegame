# Plan 2: Backfill Triggers and Minimal Ingestion Loop for bridgethegame

## Purpose
Enable podcast owners (or us, during early builds) to **select and re-ingest any number of past episodes** into the pipeline. This is critical for onboarding entire back catalogs, validating idempotency, and providing a "migration as a service" path.

---

## Intent & Approach
**Start small: Just trigger Inngest and fetch from Podbean API.**

We're taking an incremental approach:
1. **This step**: Build a simple trigger that:
   - Sends an event to Inngest with an episode ID
   - Inngest function fetches episode metadata from Podbean API
   - Logs the data and marks as successful
   - That's it!

2. **Future steps** (not part of this plan):
   - Add Deepgram transcription
   - Add Pyannote diarization
   - Add data merging
   - Add Weaviate indexing

**Success criteria**: An Inngest workflow appears in the dashboard showing it received the event and successfully called Podbean API.

**Considerations for this and future iterations:**
  - Secrets and config via env vars
  - Error handling basics
  - Event schema stability
  - Idempotency placeholder
  - Observability/logging beyond just success
  - Test with at least two episodes
  - Podbean OAuth token refresh handling
  - Episode ID format validation
  - Retry strategy for API failures

---

## Context
- Real-time ingestion only handles new episodes moving forward.
- Many podcasts have **100+ historical episodes** that contain valuable knowledge.
- Manual backfill ensures episodes can be processed:
  - in bulk (all episodes at once),
  - selectively (a handful),
  - or repeatedly (forced re-ingest when transcripts/diarization improve).  

---

## Triggers & Entry Points
1. **CLI Utility**: developer-facing tool for testing, backfilling, or debugging.  
2. **Bridge Console Web UI**: list episodes (fetched via Podbean API), allow checkboxes and “Go” action.  
3. **API Endpoint**: accepts JSON with episode IDs + options, useful for automation or third-party integrations.

---

## Event Contract
All backfill paths converge into a single Inngest event:

```json
{
  "name": "podbean.episode.ingest.requested",
  "data": {
    "episode_id": "string",
    "mode": "backfill",
    "force": false,
    "requested_by": "string | null",
    "priority": "normal | high"
  }
}
```

---

## Processing Strategy
- **Batching**: break into chunks (10–20 episodes per run) to respect Podbean/Deepgram limits.  
- **Rate limiting**: introduce small delays (e.g. `step.sleep`) or batch throttling to avoid Podbean API rate limits during retries or backfill.
- **Idempotency**:  
  - Check Weaviate for `episode_id` marker before starting.  
  - Skip if already present unless `force=true`.  
- **Resumability**: keep cursor state to recover mid-batch crashes.  

---

## User Feedback
- **MVP**: logs or database table tracking episode_id, status, timestamp.  
- **Extended**: Bridge Console displays a progress bar per job, with states: *Pending, Processing, Indexed, Failed*.  

---

## Service Potential
Manual backfill is not just infrastructure — it’s a **business feature**:  
- One-time onboarding of entire catalogs.  
- Differentiates BridgeTheGame from purely real-time competitors.  
- Future monetization path: “Pay once to ingest your archive, then stay subscribed for realtime.”  

---

## Implementation Steps (For This Plan)

1. **Setup Inngest**:
   - Install Inngest SDK
   - Create basic project structure
   - Set up local development environment

2. **Create Simple Trigger**:
   - Build a basic CLI script that sends an event to Inngest
   - Event payload: `episode_id` from Podbean (format: alphanumeric string like "ABC123DEF456")
   - Add validation: check episode_id matches expected pattern before sending

3. **Build Minimal Inngest Function**:
   - Receives the event
   - Implements Podbean OAuth flow (get access token, handle refresh)
   - Calls Podbean API to fetch episode metadata
   - Add error handling for Podbean failures (auth errors, 404s, rate limits)
   - Configure Inngest retry policy (3 attempts with exponential backoff)
   - Log both success and failure with structured data
   - Maintain schema with extra fields, even if unused
   - Returns typed success/failure response

4. **Test**:
   - Trigger with a known episode ID from Plan 1's replicated archive
   - Verify Inngest dashboard shows the workflow ran
   - Confirm Podbean data was fetched
   - Test with multiple episodes (e.g. one short and one long) to validate consistency

## Next Steps (Future Iterations)
- Add the next API integration (Deepgram or Pyannote)
- Build incrementally, one step at a time
- Eventually add batching, error handling, and UI triggers  
