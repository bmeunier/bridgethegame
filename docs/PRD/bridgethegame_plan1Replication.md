# Plan 1: Replication Pilot – bridgethegame

## Goal
Replicate *The Game* podcast archive into Podbean as a private/internal test environment.  
This serves as the foundation for later pipeline steps (transcription, diarization, indexing).  

---

## Scope
- Pilot: 10–12 episodes minimum.  
- Full: if Podbean supports RSS import, mirror the entire archive.  
- Episodes must retain original titles, descriptions, and publish dates to match Spotify/Apple.  
- Re-host audio files in Podbean (not just linked).  
- Keep the feed private (not publicly accessible).  
- Disable Podbean auto-features (titles, chapters, transcripts).  
- Add disclaimer on podcast homepage:  
  > “This feed is a replicated archive of *The Game* podcast for educational and research purposes only. Not for public distribution.”  

---

## Tasks

### 1. Setup Podbean Environment
- [ ] Create new Podbean account (dedicated for bridgethegame).  
- [ ] Configure podcast settings (private feed).  
- [ ] Add homepage disclaimer.  

### 2. Import / Upload Episodes
- [ ] Check if Podbean supports **RSS import**.  
  - If yes → mirror entire archive.  
  - If no → manually upload 10–12 MP3s for pilot.  
- [ ] Re-host audio in Podbean (upload MP3s).  
- [ ] Ensure episode metadata matches Spotify/Apple.  

### 3. Configure Settings
- [ ] Disable Podbean auto title/chapter/transcript generation.  
- [ ] Verify publish dates and episode order match originals.  
- [ ] Confirm naming conventions are preserved (episode numbers, etc.).  

### 4. Validation
- [ ] Confirm pilot episodes appear in Podbean dashboard.  
- [ ] Confirm metadata accuracy (titles, dates, descriptions).  
- [ ] Confirm audio playback works from Podbean.  
- [ ] Confirm privacy settings block public access.  

---

## Deliverable
A **replicated internal podcast feed** in Podbean that faithfully mirrors *The Game* archive (or a pilot subset), ready for API-driven ingestion in the next plan.  

---

## Next Step
Once replication is validated:  
→ Proceed to **Plan 2: Pipeline Test (1 Episode)** – run Podbean → Deepgram → Pyannote → merge → Weaviate for a single episode.