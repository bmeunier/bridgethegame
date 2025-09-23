# Diarization Refactor Recommendations

## The Real Fix Needed

The actual issue is in Step 3 where the full diarization response is processed in memory. Split it into smaller steps:

```typescript
// Step 3a: Save raw diarization immediately
const diarizationKey = await step.run("save-raw-diarization", async () => {
  const key = `diarization/${episode_id}/pyannote_raw.json`;
  await storage.saveJson(key, diarization);
  return key;
});

// Step 3b: Process with only metadata returned
const identificationSummary = await step.run("cluster-speaker-identification", async () => {
  // Load diarization from S3
  const diarization = await storage.loadJson(diarizationKey);

  // ... do processing ...

  // Save results to S3
  const speakerMapKey = `diarization/${episode_id}/speaker_map.json`;
  await storage.saveJson(speakerMapKey, identifiedSpeakers);

  // Return only summary
  return {
    identified_count: Object.keys(identifiedSpeakers).length,
    near_misses_count: missedMatches.length,
    speaker_map_key: speakerMapKey,
  };
});
```

## Recommendations

### 1. Focus on the Actual Problem

Don't refactor the entire function. Just fix Step 3 to:

```typescript
// Split the large step into smaller ones
await step.run("save-diarization", async () => {
  const key = `diarization/${episode_id}/raw.json`;
  await storage.saveJson(key, diarization);
  return { key, segments: diarization.segments.length };
});

await step.run("identify-speakers", async () => {
  const diarization = await storage.loadJson(diarizationKey);
  // Process and save results
  return { summary_only: true };
});
```

### 2. Preserve Existing Functionality

Keep all the sophisticated features:
- Cluster-level speaker identification
- Deepgram fallback mechanism
- Near-miss tracking
- Audit artifacts generation

### 3. Add Proper Error Boundaries

```typescript
const enrichmentResult = await step.run("enrich-transcript", async () => {
  try {
    // Load necessary data from S3
    const [transcript, speakerMap] = await Promise.all([
      storage.loadJson(transcriptKey),
      storage.loadJson(speakerMapKey)
    ]);

    const enriched = enrichTranscript(transcript.utterances, diarization, speakerMap);

    // Save immediately to S3
    const enrichedKey = PyannoteStorageKeys.getEnrichedTranscriptKey(episode_id);
    await storage.saveJson(enrichedKey, enriched);

    // Return only metadata
    return {
      enriched_key: enrichedKey,
      segments_count: enriched.length,
      identified_count: enriched.filter(s => s.speaker_confidence !== null).length,
    };
  } catch (error) {
    // Handle S3 failures gracefully
    console.error('Enrichment failed:', error);
    throw error;
  }
});
```

### 4. Better Testing Strategy

Test the actual complexity:

```typescript
describe('diarizeEpisode S3 optimization', () => {
  it('should handle large diarization responses without exceeding step limits', async () => {
    // Create a large mock diarization (1000+ segments)
    const largeDiarization = {
      segments: Array.from({ length: 1500 }, (_, i) => ({
        start: i * 2,
        end: (i + 1) * 2,
        speaker: `SPEAKER_${i % 10}`
      }))
    };

    // Mock S3 operations
    const saveJsonMock = jest.fn();
    const loadJsonMock = jest.fn()
      .mockResolvedValueOnce(largeDiarization)
      .mockResolvedValueOnce(mockTranscript);

    // Run the function
    const result = await diarizeEpisode.handler({ event, step });

    // Verify S3 saves were called
    expect(saveJsonMock).toHaveBeenCalledWith(
      expect.stringContaining('diarization/'),
      expect.any(Object)
    );

    // Verify only lightweight data returned
    expect(JSON.stringify(result).length).toBeLessThan(5000);
  });
});
```

## Implementation Checklist

1. ✅ Keep existing function structure
2. ✅ Add S3 save immediately after Pyannote API call (Step 2)
3. ✅ Split Step 3 into save + process with S3 loads
4. ✅ Ensure Step 4 loads from S3, not memory
5. ✅ Test with 3+ hour episodes (large payloads)
6. ✅ Preserve all existing features

## What NOT to Do

- Don't create a new simplified `diarizeFn` - you'll lose critical features
- Don't remove speaker identification logic
- Don't eliminate the Deepgram fallback
- Don't use `s3://` prefixes in keys
- Don't return full objects from steps

## Correct Storage Pattern

Use key-based storage without the `s3://` prefix:

```typescript
// Correct
const diarizationKey = `diarization/${episode_id}/pyannote_raw.json`;
await storage.saveJson(diarizationKey, diarization);

// Incorrect (from the plan)
const s3_diarization_path = `s3://bridgethegame/diarization/${episode_id}.json`;
```

## Summary

The fix needed is surgical, not a full refactor. Focus on splitting Step 3 to save intermediate results to S3 and return only lightweight metadata through Inngest steps.