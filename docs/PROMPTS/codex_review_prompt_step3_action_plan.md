# Action Plan: Step 3 Pipeline Code Review Fixes

This document summarizes Codex’s findings from the code review and translates them into a clear set of engineering tasks. Use this as a backlog to guide the next iteration of improvements.

---

## Key Issues and Fixes

### 1. Integration-Test Health Checks

- **Issue:** `scripts/test_inngest_pipeline.ts` masks outages by using `.catch()` inside `axios.get`, so it always prints ✅ even if services are down.
- **Fix:** Remove the inner `.catch()` or inspect response status codes. Let the outer `try/catch` handle errors so failures are visible.
- **Verification:** Stop Inngest or API service, rerun test, and confirm it fails loudly.

---

### 2. ParseResponse O(n²) Mapping

- **Issue:** In `src/lib/deepgram.ts`, mapping utterance words back to normalized word indices uses `findIndex` inside nested loops → O(n²).
- **Fix:** Refactor to O(n) using a `Map` keyed by timestamps or a rolling pointer (arrays are sorted). Each word should only be scanned once.
- **Verification:** Benchmark with long transcripts (60+ min episodes) to confirm runtime improvements.

---

### 3. S3 Partial Write Risk

- **Issue:** In `transcribe_episode.ts`, normalized JSON is saved before raw JSON. If raw save fails, S3 has partial data.
- **Fix:**
  - Option A: Save raw JSON first, then normalized JSON.
  - Option B: Wrap saves in a transaction-like flow — delete normalized if raw fails.
- **Verification:** Add unit/integration test that simulates second write failing, confirm no partial transcript left in S3.

---

### 4. Event Emission on Cache Hits

- **Issue:** `transcribe_episode.ts` skips processing if transcript exists, but does not emit `episode.transcript.completed`. Downstream automation may depend on this.
- **Fix:** Decide on contract:
  - If downstream should always run → emit event even for cached transcripts.
  - If skipping is intended → document this clearly in README/PRD.
- **Verification:** Add test ensuring expected behavior (emit vs skip).

---

## Prompt for Codex (for next run)

Use this prompt to validate fixes once implemented:

```
Review the updated pipeline after applying the Step 3 code review fixes:
1. Verify integration-test health checks now fail when services are down.
2. Confirm parseResponse mapping is O(n), not O(n²), by inspecting code and testing with long transcripts.
3. Check that S3 writes are safe: no partial transcript files remain if one save fails.
4. Ensure event emission behavior on cache hits matches the intended contract, and is tested.
Provide findings with line references and any additional risks.
```

---

## Priority Order

1. Health check fix (safety)
2. Event emission contract (pipeline correctness)
3. O(n²) mapping fix (performance/scalability)
4. S3 rollback (resilience)

---

## Deliverables

- Code fixes in the relevant files.
- Updated unit/integration tests.
- Documentation/README updates clarifying event emission semantics.
