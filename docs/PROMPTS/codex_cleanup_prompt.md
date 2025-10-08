# Prompt: BridgeTheGame Codebase Cleanup & Refactor

You are Codex. You have full access to the repo. Execute the following cleanup and improvements in order. After each step, confirm with logs (git diff, ls, test runs) before moving forward.

---

## Step 1: Dead Weight Deletions

1. Remove the unused `delay` helper in `src/inngest/functions/ingest_episode.ts`.
   - Delete the `delay` import/definition.
   - Confirm no references remain: `grep -r "delay" src/`.

2. Consolidate step-output utils:
   - Keep `src/lib/safe_step_output.ts`.
   - Delete `src/lib/inngest-utils.ts`.
   - Update all imports that referenced `inngest-utils.ts`.

3. Delete old hard-coded diagnostic scripts:
   - `scripts/check_enriched.ts`
   - `scripts/check_raw_transcript.ts`

   Confirm they are gone: `ls scripts/`.

---

## Step 2: Critical Fixes for Diarization

1. In `src/lib/pyannote.ts`:
   - Replace hard-coded confidence (0.88) with a polling loop that checks `/identify/{jobId}` until status is `done` or `error`.
   - Return actual job results. Fail fast on errors.

2. In `src/inngest/functions/diarize_episode.ts`:
   - Add explicit guard:
     ```ts
     if (!process.env.PYANNOTE_API_KEY) {
       throw new Error("Missing PYANNOTE_API_KEY in environment");
     }
     ```

3. In `src/lib/speaker-utils.ts`:
   - Replace `?start&end` hack with real clip extraction.
   - Use FFmpeg (`ffmpeg -ss <start> -to <end> -i input -c copy output.mp3`).
   - Upload clip to S3 and return signed URL.
   - Ensure Pyannote identify gets real subclips, not full audio.

---

## Step 3: Optimizations

1. In `src/lib/pyannote.ts`:
   - Pass `max_speakers` and other diarization options from caller into POST body.

2. Enforce TypeScript hygiene:
   - In `tsconfig.json`, set:
     ```json
     "noUnusedLocals": true,
     "noUnusedParameters": true
     ```

3. Add `.nvmrc` with Node version `20` in repo root.

---

## Step 4: Scripts Modernization

1. Recreate parameterized diagnostic scripts:

   **scripts/check_enriched.ts**

   ```ts
   const episodeId = process.argv[2];
   if (!episodeId) throw new Error("Usage: tsx check_enriched.ts <episodeId>");

   import { checkEnriched } from "../src/lib/check-utils";
   checkEnriched(episodeId);
   ```

   **scripts/check_raw_transcript.ts**

   ```ts
   const episodeId = process.argv[2];
   if (!episodeId)
     throw new Error("Usage: tsx check_raw_transcript.ts <episodeId>");

   import { checkRawTranscript } from "../src/lib/check-utils";
   checkRawTranscript(episodeId);
   ```

   Verify:

   ```bash
   npx tsx scripts/check_enriched.ts XWPJS196C945
   ```

---

## Step 5: Repo Hygiene

1. Delete build artefacts:

   ```bash
   rm -rf dist
   ```

2. Add npm scripts in `package.json`:

   ```json
   "scripts": {
     "lint": "eslint src --ext .ts",
     "format": "prettier --write ."
   }
   ```

3. Install dev tools:
   ```bash
   npm install --save-dev eslint prettier
   ```

---

## Step 6: Validation

1. Run tests:

   ```bash
   npm test
   ```

2. Run lint/format:

   ```bash
   npm run lint
   npm run format
   ```

3. Trigger a sample ingestion:

   ```bash
   npm run trigger XWPJS196C945 manual true
   ```

4. Confirm:
   - No runtime errors in logs.
   - S3 artifacts appear for the episode.
   - Speaker diarization uses real clips and real confidence.

---

## Reporting

At the end, provide:

1. A `git diff --stat` summary of changes.
2. Any remaining TODOs (e.g. stubs, unimplemented error handling).
3. Confirmation that the pipeline runs end-to-end after cleanup.
