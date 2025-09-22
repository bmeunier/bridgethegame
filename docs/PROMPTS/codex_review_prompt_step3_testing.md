# Prompt: Step 3 Stress Testing (Deepgram Transcription with Inngest + S3)

You are continuing from the previous Step 3 pipeline work. Context:  
- The pipeline integrates @deepgramai for transcription, triggered by @inngest events.  
- Full transcript JSON is written to S3, while only a **summary** (word count, utterance count, duration, etc.) is returned through Inngest to avoid `output_too_large`.  
- Express server body size limits were raised to `100mb` and made configurable via `.env` (`EXPRESS_BODY_LIMIT`).  
- This was tested with episode **WRQZ7196C943** (6.7 hours long) and should now succeed without payload size errors.  

## Recent Fixes
1. Increased Express body limits (`EXPRESS_BODY_LIMIT=100mb`).  
2. Modified `transcribe_episode` Inngest function to only return summary data while saving the full transcript to S3.  
3. Ensured rollback on S3 writes to prevent partial saves.  
4. Emitted `episode.transcript.completed` even on cached transcripts.  

## Task
1. **Start testing with WRQZ7196C943 (6.7 hours)** again. Force reprocess until it completes successfully.  
2. If it fails, debug *why* and iterate until success.  
   - Possible failure modes: S3 storage, memory pressure, timeout, or transcript parsing edge cases.  
3. Once WRQZ7196C943 passes, run the pipeline against a **1-hour episode** and a **30-minute episode** to confirm smaller inputs are not broken by the recent fixes.  
4. At the end, produce a short report including:  
   - Episode IDs tested  
   - Success/failure status  
   - Any remaining risks or limits still visible  

## Deliverables
- Logs and validation for each test run.  
- Confirmation that the S3 transcript JSON is intact and complete (with `deepgram_speakers` preserved).  
- Recommendations if further tuning is needed before moving to Step 4 (pyannote diarization).  
