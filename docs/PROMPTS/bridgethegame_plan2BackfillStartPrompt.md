You are my coding partner for the Bridge The Game project. Execute **Plan 2: Backfill Triggers and Minimal Ingestion Loop for bridgethegame** step by step. Think out loud as you work. Explain what you are doing and why. If you get stuck or see yourself repeating actions, pause and reassess. Keep me updated on progress and any decisions you make. Begin now.

docs/PRD/bridgethegame_plan2Backfill.md

## Project context
Goal for this step: a tiny but real loop  
**Trigger → Inngest → Podbean API → Log success in the Inngest dashboard**

We already have this plan written:  
Read the plan: https://github.com/bmeunier/bridgethegame/blob/main/docs/PRD/bridgethegame_plan2Backfill.md  
Follow that plan exactly. Use it as the source of truth.

---

## Deliverables for this step
1. **Inngest setup**
   - Inngest client and dev server wiring
   - One function: `podbean.episode.ingest.requested`
   - Configurable retries with exponential backoff

2. **Simple trigger**
   - CLI script or minimal API route to send events to Inngest
   - Validates `episode_id` format before sending

3. **Minimal ingestion function**
   - Receives event data with fields from the plan
   - Implements Podbean OAuth access using env vars
   - Includes token refresh logic
   - Calls Podbean for episode metadata by `episode_id`
   - Handles errors and rate limits
   - Logs structured success and failure

4. **Testing**
   - Run against at least two episode IDs
   - Show screenshots or console proof that the function ran and logged
   - Document exact commands I should run

---

## Constraints and standards
- Keep code in TypeScript
- Do not introduce a frontend right now
- Use environment variables for secrets
- No em dashes in comments or docs
- Add a `.env.example` with clear keys
- Use simple, structured logs that show status and episode id
- If a secret is missing, mock where needed and mark the spot with a clear TODO

---

## Environment variables to use
Create `.env.example` with these keys. Do not put real values in the repo.

```
INNGEST_SIGNING_KEY=
INNGEST_EVENT_KEY=
PODBEAN_CLIENT_ID=
PODBEAN_CLIENT_SECRET=
PODBEAN_REDIRECT_URI=
PODBEAN_ACCESS_TOKEN=
PODBEAN_REFRESH_TOKEN=
PODBEAN_API_BASE=https://api.podbean.com  # or leave as default in code
```

---

## Event contract
Use one event name everywhere:  
`podbean.episode.ingest.requested`

Data fields to accept now:
```
episode_id: string
mode: "backfill" | "manual" | "realtime"  # default backfill is fine
force: boolean                            # default false
requested_by: string | null
priority: "normal" | "high"               # default normal
```
Validate `episode_id` with a sane pattern. If it fails, do not send the event.

---

## Function behavior
- On receive, log input as structured JSON
- OAuth: try access token, if expired use refresh token, then retry once
- Fetch episode metadata by `episode_id`
- Handle error classes: auth failure, not found, rate limited, unknown
- Use a small delay or throttle on backfill to avoid bursts
- Keep an idempotency hook as a stub for now. Example function that returns false with a TODO
- On success, log a clear success record
- On failure, log a clear failure record and let the retry policy handle the rest

---

## Files to create or update
- `src/inngest/client.ts` for client setup
- `src/inngest/functions/ingest_episode.ts` for the function
- `scripts/send_event.ts` for CLI trigger
- `src/lib/podbean.ts` for OAuth client and metadata fetch helper
- `.env.example`
- `docs/DEVLOG/step2_min_loop.md` short notes with run commands and results

---

## Logging format examples
On success:
```
{ "scope":"ingest_episode", "status":"success", "episode_id":"ABC123", "source":"podbean", "mode":"backfill" }
```

On failure:
```
{ "scope":"ingest_episode", "status":"error", "episode_id":"ABC123", "error_type":"auth" , "message":"token expired" }
```

---

## Retry policy
- Configure function retries to 3 attempts with exponential backoff
- For 429 or 5xx, rely on retry policy
- For 401 with expired token, perform one refresh cycle then retry the call once in the same run

---

## Rate limiting
- Add a small delay utility for backfill mode to avoid spikes
- Document how to tune it

---

## Test plan
- Show the exact `pnpm` or `npm` commands to run the dev server and the CLI trigger
- Provide two example episode IDs in a config file or comments
- After running, show me the logs that prove success and failure paths

---

## Reporting format
As you work, narrate each step like this:
1. What you are about to change  
2. The diff or files created  
3. Why this is the right move  
4. How to run it locally to test  
5. Results and next step  

If something blocks you, say what is missing. Offer a safe fallback or a mock so we can keep moving.

**Begin now.**
