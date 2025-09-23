# Inngest Function Discovery & Execution Checklist

This checklist is for focusing exclusively on **Inngest function discovery and execution**, not Pyannote or registry setup.

---

## 1. Run both servers side by side
```bash
npm run dev          # Express app on port 3000 (exposes /api/inngest)
npm run inngest-dev  # Inngest CLI on port 8288
```

---

## 2. Verify discovery endpoint
- Open [http://localhost:3000/api/inngest](http://localhost:3000/api/inngest).
- Confirm it lists **all three functions**:
  - `ingest_episode`
  - `transcribe_episode`
  - `diarize_episode`

---

## 3. Fix missing functions if needed
- Check that `src/inngest/functions/diarize_episode.ts` correctly exports a function (`export default` or `export const diarizeFn`).
- Ensure `src/inngest/index.ts` imports and registers it.

---

## 4. Force discovery in Inngest CLI
```bash
curl -X PUT http://localhost:8288/api/v1/discovery   -H "Content-Type: application/json"   -d '{"url":"http://localhost:3000/api/inngest"}'
```
- This makes the dev server pull functions from your Express app.

---

## 5. Trigger an end-to-end test
```bash
npm run trigger eb5q57pvxpm
```

This should cascade:

```
podbean.episode.ingest.requested
   → transcribe_episode
   → episode.transcribed.deepgram.completed
   → diarize_episode
```

---

## 6. Watch logs
- Look in `npm run dev` output for function start/end logs.
- If nothing shows → problem = discovery.
- If function logs show but errors → problem = implementation.

---

### 🔑 One-liner for Claude Code
“Follow this checklist to debug Inngest function discovery. Ignore Pyannote for now.” 
