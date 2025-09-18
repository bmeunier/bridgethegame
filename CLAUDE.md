# Bridge The Game - Project Documentation

## Project Overview
**Bridge The Game** is a serverless pipeline that bridges Podbean (podcast hosting) to Weaviate (semantic search engine) for The Game podcast. It enriches podcast episodes with AI-powered transcription, speaker diarization, and semantic indexing to create a searchable knowledge base.

**Domain**: bridgethegame.felo5.com

## Purpose
Transform raw podcast episodes into structured, searchable knowledge by:
- Automatically ingesting new episodes from Podbean
- Enriching with accurate transcripts and speaker identification
- Indexing into Weaviate for semantic and keyword hybrid search
- Creating a living, queryable archive of The Game podcast

## Architecture

### Core Pipeline Flow
1. **Trigger**: New episode published on Podbean (manual or cron-based)
2. **Orchestration**: Inngest workflow engine coordinates all API calls
3. **Enrichment**:
   - Podbean API: Episode metadata, audio URLs, AI chapters/titles
   - Deepgram API: High-quality transcription with timestamps
   - Pyannote API: Speaker diarization and voiceprint identification
4. **Merge**: Combine all data into structured objects (metadata + transcript chunks + speakers + timestamps)
5. **Indexing**: Push to Weaviate Cloud for automatic embeddings and hybrid search

### Tech Stack
- **Orchestrator**: Inngest (event-driven workflow engine)
- **Search Engine**: Weaviate Cloud (semantic + hybrid search, built-in embeddings)
- **APIs**:
  - Podbean API (episode data and AI-generated chapters)
  - Deepgram API (transcription service)
  - Pyannote API (speaker diarization)

### Key Features
- Serverless architecture (no servers to maintain)
- Automatic episode ingestion
- Speaker-aware transcripts with precise timestamps
- Retains Podbean's AI-generated titles and chapters
- Semantic and keyword hybrid search across entire archive
- Event-driven processing via Inngest

## Development Guidelines

### Project Structure
```
bridgethegame/
├── CLAUDE.md           # This file
├── docs/
│   └── PRD/
│       └── bridgethegame_v1.md
├── src/
│   ├── functions/      # Inngest functions
│   ├── lib/           # Shared utilities
│   └── types/         # TypeScript type definitions
├── .env.example       # Environment variables template
├── package.json       # Node.js dependencies
└── tsconfig.json      # TypeScript configuration
```

### Environment Variables
```
# Podbean API
PODBEAN_CLIENT_ID=
PODBEAN_CLIENT_SECRET=

# Deepgram API
DEEPGRAM_API_KEY=

# Pyannote API
PYANNOTE_API_KEY=

# Weaviate Cloud
WEAVIATE_URL=
WEAVIATE_API_KEY=

# Inngest
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

### API Resources
- [Podbean API Documentation](https://developers.podbean.com/podbean-api-docs/)
- [Deepgram Documentation](https://developers.deepgram.com/)
- [Pyannote Documentation](https://docs.pyannote.ai/)
- [Inngest Documentation](https://www.inngest.com/docs)
- [Weaviate Documentation](https://docs.weaviate.io/weaviate)
- [Weaviate Cloud](https://docs.weaviate.io/cloud)

## Commands

### Development
```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Format code
npm run format
```

### Deployment
```bash
# Deploy to production
npm run deploy

# Run tests
npm test
```

## Testing Strategy
- Unit tests for individual API integrations
- Integration tests for the full pipeline
- Mock API responses for development
- Test with sample podcast episodes

## Error Handling
- Retry logic for API failures
- Dead letter queue for failed processing
- Detailed logging for debugging
- Graceful degradation when services unavailable

## Security Considerations
- All API keys stored as environment variables
- Secure communication with all external APIs
- No sensitive data stored locally
- Audit logging for all processing activities

## Previous Iterations
This project evolved from earlier experiments:
- **talkthegame.felo5.com**: Conversational transcript interaction
- **askthegame.felo5.com**: Early Q&A system with embeddings
- **readthegame.felo5.com**: Structured episode reading experience

The current iteration focuses on lean, serverless architecture with direct Podbean-to-Weaviate bridging.

## Contact
Project maintainer: Benoit Meunier

## License
Private project - All rights reserved