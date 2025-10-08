You are helping debug a diarization pipeline in the **BridgeTheGame** project.  
The situation: diarization has successfully run for episode `WRQZ7196C943`, but when downloading from S3 (`s3://bridgethegame-audio-123/diarization/WRQZ7196C943/enriched.json`), the file is empty. The expectation is that `enriched.json` contains speaker-attributed transcript data.

## Context

- Pipeline stages:
  1. Raw transcript (Deepgram)
  2. Pyannote segmentation (`who spoke when`)
  3. ECAPA-TDNN matching (map segments to known speakers)
  4. Confidence filtering & chunk merging
  5. Normalization → `normalized.json`
  6. Enrichment (sidecar merge, speaker metadata, etc.) → `enriched.json`

- Symptom: `enriched.json` is empty (0 bytes or `{}`).
- Likely cause: enrichment step received `None` or empty arrays, or a mismatch in expected keys between normalization and enrichment.

## Tasks for You (Claude)

1. **Trace the data flow**
   - Locate where `normalized.json` is created.
   - Locate where `enriched.json` is written.
   - Check how data is passed between them.

2. **Verify file contents upstream**
   - Does `normalized.json` contain speaker segments?
   - Which keys are present (`segments`, `speakers`, `utterances`, etc.)?
   - Are those keys referenced correctly in enrichment code?

3. **Check the enrichment function**
   - Which function or class writes `enriched.json`?
   - Does it handle empty input gracefully, or does it silently dump `{}`?
   - Are there try/except blocks that swallow errors?

4. **Look for schema mismatches**
   - Is enrichment expecting a field name that no longer exists (e.g. `speaker_segments` vs `segments`)?
   - Did the confidence filter or chunk-merger change the schema before enrichment?

5. **Verify logging / error handling**
   - Are there warnings or stack traces suppressed by default?
   - Should errors propagate instead of producing an empty file?

6. **Debug recommendations**
   - Propose logging checks to add.
   - Suggest how to fail fast if no segments are found, instead of silently writing empty files.
   - Show a minimal patch to ensure `enriched.json` can’t be written as empty without raising an error.

7. **Create a test snippet**
   - Write a small Python script that loads `normalized.json`, prints out the number of segments, and raises an error if it’s zero.
   - This will confirm if the bug is upstream (no segments produced) or downstream (enrichment not mapping correctly).

## Deliverable

- A clear diagnosis of why `enriched.json` is empty.
- Pointers to the exact code lines/functions involved.
- Suggested fixes or patches.
- A test snippet as described above.
