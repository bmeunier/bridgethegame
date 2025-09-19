# Project PRD: bridgethegame.felo5.com

## Context & Origin
This project is the next evolution of a series of experiments around *The Game* podcast.  
Earlier prototypes included:
- **[talkthegame.felo5.com](https://talktothegame.bearblog.dev/blog/)** — conversational interaction with transcripts.  
- **askthegame.felo5.com** — early Q&A system powered by embeddings.  
- **[https://github.com/bmeunier/readthegame](https://github.com/bmeunier/readthegame)** — structured reading experience of episodes.  

While these showed the potential of turning podcast audio into structured data, they were heavy and complex. The pivot is toward something leaner and more directly useful: a bridge between Podbean (where the podcast is hosted) and Weaviate (where enriched episodes live as a searchable knowledge base).  

This project is named **bridgethegame.felo5.com** because it literally connects The Game podcast archive to a semantic engine, transforming raw episodes into structured, queryable knowledge.

---

## Overview
This project bridges Podbean to Weaviate (a semantic search engine) by enriching podcasts with high-quality AI processing and automatically indexing them into a living knowledge base.

- **Trigger**: Podbean publishes a new episode.  
- **Pipeline**: Inngest orchestrates API calls to:  
  - Podbean (episode metadata, AI chapters, titles)  
  - Deepgram (accurate transcript with timestamps)  
  - Pyannote API (speaker diarization + voiceprints)  
- **Enrichment**: Merge outputs into a structured object (episode metadata + transcript chunks + speakers + timestamps).  
- **Indexing**: Push directly into Weaviate Cloud (automatic embeddings + hybrid search).  

---

## Core Features
- Automatic ingestion of new episodes (manual or cron-based).  
- Speaker-aware transcripts with timestamps.  
- Retain Podbean’s AI labels (titles, chapters) for navigation.  
- Searchable across entire archive with semantic + keyword hybrid queries.  
- No servers to maintain (everything orchestrated in Inngest with API calls).  

---

## Tech Stack
- **Orchestrator**: Inngest (workflow engine, event-driven)  
- **Hosting**: Weaviate Cloud (semantic + hybrid search, embeddings built-in)  
- **APIs**:  
  - Podbean API (metadata, audio URLs, AI extras)  
  - Deepgram API (transcription)  
  - Pyannote API (diarization + speaker IDs)  

---

## Resources
- [Podbean API Docs](https://developers.podbean.com/podbean-api-docs/)  
- [Pyannote Docs](https://docs.pyannote.ai/)  
- [Deepgram Docs](https://developers.deepgram.com/)  
- [Inngest Docs](https://www.inngest.com/docs)  
- [Weaviate Docs](https://docs.weaviate.io/weaviate)  
- [Weaviate Cloud](https://docs.weaviate.io/cloud)  
- [Weaviate Deploy](https://docs.weaviate.io/deploy)  

---

## Architecture Diagram

```mermaid
flowchart TD

    A[Podbean API] -->|episode meta, audio URL, AI chapters| B[Inngest Orchestrator]

    B --> C[Deepgram API\nTranscript + Timestamps]
    B --> D[Pyannote API\nDiarization + Speakers]
    B --> E[Podbean Data\nTitles + Chapters]

    C --> F[Enrichment/Merge]
    D --> F
    E --> F

    F --> G[Weaviate Cloud\nEmbeddings + Hybrid Search + Metadata Index]