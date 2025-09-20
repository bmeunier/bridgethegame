#!/usr/bin/env tsx
/**
 * Check the raw transcript to see if it has diarization data
 */

import * as dotenv from 'dotenv';
import { getStorageClient, StorageClient } from '../src/lib/storage';

dotenv.config();

async function checkRawTranscript() {
  const episodeId = 'XWPJS196C945';

  try {
    const storage = getStorageClient();
    const rawKey = StorageClient.getTranscriptKey(episodeId, 'deepgram_raw');

    console.log('Checking raw Deepgram response...');
    const rawResponse = await storage.loadJson(rawKey);

    console.log('\nRaw response structure:');
    console.log('- metadata:', Object.keys(rawResponse.metadata || {}));
    console.log('- results:', Object.keys(rawResponse.results || {}));

    if (rawResponse.results?.channels?.[0]?.alternatives?.[0]?.words) {
      const firstWord = rawResponse.results.channels[0].alternatives[0].words[0];
      console.log('\nFirst word structure:', Object.keys(firstWord));
      console.log('Has speaker field:', 'speaker' in firstWord);
      if ('speaker' in firstWord) {
        console.log('Speaker value:', firstWord.speaker);
      }
    }

    if (rawResponse.results?.utterances) {
      console.log(`\nTop-level utterances: ${rawResponse.results.utterances.length}`);
      if (rawResponse.results.utterances.length > 0) {
        const firstUtterance = rawResponse.results.utterances[0];
        console.log('First utterance structure:', Object.keys(firstUtterance));
        console.log('Has speaker field:', 'speaker' in firstUtterance);
        if ('speaker' in firstUtterance) {
          console.log('Speaker value:', firstUtterance.speaker);
        }
      }
    } else {
      console.log('\nNo top-level utterances found');
    }

    // Check if this was generated with diarization
    const hasSpeakerInfo = rawResponse.results?.channels?.[0]?.alternatives?.[0]?.words?.some(
      (w: any) => 'speaker' in w
    );

    console.log(`\nDiarization enabled in this response: ${hasSpeakerInfo ? 'YES' : 'NO'}`);

  } catch (error) {
    console.error('Error:', error);
  }
}

checkRawTranscript();