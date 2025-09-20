# bridgethegame.felo5.com

> Building a bridge between **Podbean** and **Weaviate** to turn podcast archives into living, searchable knowledge bases.  
> Pilot project: *The Game* podcast by Alex Hormozi by [Benoit Meunier](https://x.com/bmeunier)  

## 🎯 What is this?
bridgethegame is an experiment in making podcasts truly usable.  
Instead of flat transcripts or auto-generated chapters, the goal is to **enrich episodes with high-quality AI processing** and **index them into Weaviate** for semantic + hybrid search.

This project grew out of earlier prototypes:
- **[talkthegame.felo5.com](https://talktothegame.bearblog.dev/blog/)** – conversational interaction with transcripts  
- **[askthegame.felo5.com](https://askthegame.felo5.com)** – early Q&A system powered by embeddings  
- **[readthegame.felo5.com](https://github.com/bmeunier/readthegame)** – structured reading experience of episodes  

Each one taught me something. Now I’m pivoting to a leaner build: **bridge → enrich → search**.

## ✍Blog
I’m documenting this project as a working blog in the repo wiki:  
👉 [bridgethegame Wiki Blog](https://github.com/bmeunier/bridgethegame/wiki)

## Hypothesis

- **Replication**: Mirror episodes of *The Game* podcast into Podbean (private for testing).  
- **Orchestration**: Use [Inngest](https://www.inngest.com/) to trigger workflows when new episodes appear.  
- **Transcription**: [Deepgram](https://developers.deepgram.com/) provides accurate transcripts with timestamps.  
- **Diarization**: [Pyannote API](https://docs.pyannote.ai/) adds speaker IDs and voiceprints.  
- **Enrichment**: Merge Podbean metadata, transcripts, and speaker segments into a structured object.  
- **Indexing**: Push to [Weaviate Cloud](https://weaviate.io/) for embeddings + hybrid search.  

## Documentation
- [Project PRD (v1)](./docs/PRD/bridgethegame_v1.md)
- [Plan 1 – Replication Pilot](./docs/PRD/bridgethegame_plan1Replication.md)
- [Plan 2: Backfill Triggers and Minimal Ingestion Loop for bridgethegame](docs/PRD/bridgethegame_plan2Backfill.md)
- [Plan 3: Deepgram Transcription Service](docs/PRD/bridgethegame_plan3Transcription.md)

## Implementation Status
✅ **Plan 3 Complete**: Deepgram transcription with speaker diarization sidecar field
- Canonical transcript structure preserved for pyannote integration
- Deepgram speaker segments stored in optional `deepgram_speakers` field for debugging/analysis
- Tested with real podcast episodes (327x realtime processing speed!)
- Ready for Plan 4: Pyannote speaker diarization

## ⚠️ Disclaimer
This is an **educational and research project**.  
Replicated episodes of *The Game* are private and not redistributed publicly.  
All work is exploratory, with no affiliation to Alex Hormozi or Acquisition.com.
