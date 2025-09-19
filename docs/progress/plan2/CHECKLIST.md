# Plan 2: Backfill Implementation Checklist

## Current Status: Core Implementation Complete, Needs API Keys
**Last Updated**: 2025-09-18

---

## ✅ Phase 1: Setup
- [x] Create `.env` file with Podbean credentials
  - [ ] `PODBEAN_CLIENT_ID` (needs real value)
  - [ ] `PODBEAN_CLIENT_SECRET` (needs real value)
  - [ ] `INNGEST_EVENT_KEY` (needs real value)
- [x] Install Inngest SDK (`npm install inngest`)
- [x] Install TypeScript and dev dependencies
- [x] Create basic project structure
- [ ] Set up Inngest Dev Server locally

## ✅ Phase 2: Build Trigger
- [x] Create CLI script (`scripts/send_event.ts`)
- [x] Add episode ID validation (alphanumeric format)
- [x] Implement event sending to Inngest
- [x] Test with hardcoded episode ID (validated structure)

## ✅ Phase 3: Build Inngest Function
- [x] Create Inngest function (`src/inngest/functions/ingest_episode.ts`)
- [x] Implement Podbean OAuth flow
  - [x] Get access token
  - [x] Handle token refresh
- [x] Fetch episode metadata from Podbean API
- [x] Add error handling
  - [x] Auth failures
  - [x] 404 episodes
  - [x] Rate limits
- [x] Configure retry policy (3 attempts, exponential backoff)
- [x] Add structured logging

## 🧪 Phase 4: Testing
- [x] Test error case: Invalid episode ID (✅ Working)
- [x] Test CLI validation (✅ Working)
- [x] Test Express server startup (✅ Working)
- [x] Test event structure validation (✅ Working)
- [ ] Test with first episode ID: Needs INNGEST_EVENT_KEY
- [ ] Test with second episode ID: Needs INNGEST_EVENT_KEY
- [ ] Test error case: Wrong credentials
- [ ] Verify Inngest dashboard shows workflows
- [ ] Verify Podbean data structure

## 📝 Notes
- Express Server: ✅ Running on http://localhost:3000
- Inngest Endpoint: ✅ http://localhost:3000/api/inngest
- TypeScript: ✅ Compiles without errors
- CLI Validation: ✅ Episode ID format validation working
- Event Structure: ✅ JSON event payload correctly formatted
- Blockers: Need INNGEST_EVENT_KEY and PODBEAN credentials for full testing