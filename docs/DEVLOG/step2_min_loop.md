# Step 2: Minimal Ingestion Loop

## Goal

Create a simple but complete loop: **Trigger → Inngest → Podbean API → Log success**

## What Was Built

### 1. Project Setup

- TypeScript configuration
- Inngest SDK installed and configured
- Express server to host Inngest functions
- Environment variables structure

### 2. Core Files Created

- `src/inngest/client.ts` - Inngest client with type-safe event definitions
- `src/lib/podbean.ts` - Podbean OAuth client with token refresh
- `src/inngest/functions/ingest_episode.ts` - Main ingestion function
- `scripts/send_event.ts` - CLI trigger script
- `.env.example` - Environment variables template

### 3. Function Features

- Episode ID validation
- OAuth token refresh logic
- Rate limiting for backfill mode (2s delay)
- Structured logging (JSON format)
- Error handling for auth, 404, rate limits
- Idempotency check placeholder
- Retry policy (3 attempts with exponential backoff)

## How to Run

### Prerequisites

1. Copy `.env.example` to `.env` and fill in Podbean credentials:

   ```bash
   cp .env.example .env
   ```

2. Update `.env` with your Podbean OAuth credentials:
   ```
   PODBEAN_CLIENT_ID=your_client_id
   PODBEAN_CLIENT_SECRET=your_client_secret
   PODBEAN_ACCESS_TOKEN=your_access_token
   PODBEAN_REFRESH_TOKEN=your_refresh_token
   ```

### Running the System

1. **Start Express Server** (Terminal 1):

   ```bash
   npm run dev
   ```

   Should show: "Inngest server running on http://localhost:3000"

2. **Start Inngest Dev Server** (Terminal 2):

   ```bash
   npm run inngest-dev
   ```

   Should show Inngest dashboard at http://localhost:8288

3. **Trigger an Episode** (Terminal 3):

   ```bash
   npm run trigger YOUR_EPISODE_ID

   # Examples:
   npm run trigger ABC123DEF456
   npm run trigger ABC123DEF456 manual true
   ```

## Test Episode IDs

Add test episode IDs to your `.env` file:

```
TEST_EPISODE_ID_1=your_first_test_episode
TEST_EPISODE_ID_2=your_second_test_episode
```

## Expected Results

### Success Case

Console logs should show:

```json
{"scope":"ingest_episode","status":"started","episode_id":"ABC123","mode":"backfill","force":false}
{"scope":"ingest_episode","status":"metadata_fetched","episode_id":"ABC123","title":"Episode Title","duration":3600}
{"scope":"ingest_episode","status":"success","episode_id":"ABC123","source":"podbean","mode":"backfill","processing_time_ms":1234}
```

### Error Cases

- Invalid episode ID: Validation error before sending to Inngest
- 404 episode: "Episode not found" error in logs
- Auth failure: Token refresh attempt, then clear error message

## Troubleshooting

### Common Issues

1. **"No valid authentication token"**: Check `.env` file has correct Podbean tokens
2. **Connection refused**: Make sure both Express server and Inngest dev server are running
3. **Episode not found**: Verify episode ID exists in your Podbean account

### Checking Logs

- Function execution logs appear in Terminal 1 (Express server)
- Function status and timeline in Inngest dashboard (http://localhost:8288)

## Next Steps

This minimal loop proves the integration works. Future iterations will add:

- Deepgram transcription API
- Pyannote diarization API
- Data merging logic
- Weaviate indexing

The foundation is solid with proper error handling, logging, and retry policies.
