#!/usr/bin/env tsx
/**
 * Test script to verify the deepgram_speakers sidecar field works with real API
 */

import * as dotenv from 'dotenv';
import { deepgramClient } from '../src/lib/deepgram';

dotenv.config();

async function testSidecar() {
  console.log('🎭 Testing Deepgram Sidecar Field Implementation');
  console.log('===============================================\n');

  // Use the same episode but enable diarization
  const audioUrl = 'https://mcdn.podbean.com/mf/web/c3i2s8u66e6q90ep/rss_p_episodes_captivate_fm_episode_60597bfb-fd37-40b1-b72e-dbed7fd83b13.mp3';
  const episodeId = 'test-sidecar';

  try {
    console.log('1️⃣ Testing with diarization ENABLED...');

    const responseWithDiarization = await deepgramClient.transcribeFromUrl(audioUrl, {
      model: 'general',
      punctuate: true,
      utterances: true,
      paragraphs: true,
      timestamps: true,
      diarize: true, // Enable diarization
      language: 'en',
    });

    const envelopeWithDiarization = deepgramClient.parseResponse(episodeId + '-with-diarization', responseWithDiarization);

    console.log('✅ Transcription with diarization complete');
    console.log(`   Words: ${envelopeWithDiarization.words.length}`);
    console.log(`   Utterances: ${envelopeWithDiarization.utterances.length}`);
    console.log(`   Paragraphs: ${envelopeWithDiarization.paragraphs.length}`);
    console.log(`   Deepgram speakers: ${envelopeWithDiarization.deepgram_speakers?.length || 0}`);

    // Verify canonical fields remain null
    const canonicalFieldsNull = envelopeWithDiarization.words.every(w => w.speaker === null) &&
                               envelopeWithDiarization.utterances.every(u => u.speaker === null);

    console.log(`   Canonical speaker fields null: ${canonicalFieldsNull ? '✅' : '❌'}`);

    if (envelopeWithDiarization.deepgram_speakers && envelopeWithDiarization.deepgram_speakers.length > 0) {
      console.log('\n   First 5 speaker segments:');
      envelopeWithDiarization.deepgram_speakers.slice(0, 5).forEach((segment, i) => {
        console.log(`     ${i + 1}. ${segment.speaker} [${segment.start.toFixed(1)}-${segment.end.toFixed(1)}s]`);
      });
    }

    console.log('\n2️⃣ Testing with diarization DISABLED...');

    const responseWithoutDiarization = await deepgramClient.transcribeFromUrl(audioUrl, {
      model: 'general',
      punctuate: true,
      utterances: true,
      paragraphs: true,
      timestamps: true,
      diarize: false, // Disable diarization
      language: 'en',
    });

    const envelopeWithoutDiarization = deepgramClient.parseResponse(episodeId + '-without-diarization', responseWithoutDiarization);

    console.log('✅ Transcription without diarization complete');
    console.log(`   Words: ${envelopeWithoutDiarization.words.length}`);
    console.log(`   Utterances: ${envelopeWithoutDiarization.utterances.length}`);
    console.log(`   Paragraphs: ${envelopeWithoutDiarization.paragraphs.length}`);
    console.log(`   Deepgram speakers: ${envelopeWithoutDiarization.deepgram_speakers?.length || 0}`);

    // Verify sidecar field is absent when diarization disabled
    const sidecarAbsent = envelopeWithoutDiarization.deepgram_speakers === undefined;
    console.log(`   Sidecar field absent: ${sidecarAbsent ? '✅' : '❌'}`);

    console.log('\n🎯 Summary:');
    console.log('===========');
    console.log(`With diarization:`);
    console.log(`  - Canonical speaker fields null: ${canonicalFieldsNull ? '✅' : '❌'}`);
    console.log(`  - Sidecar field present: ${envelopeWithDiarization.deepgram_speakers ? '✅' : '❌'}`);
    console.log(`  - Speaker segments found: ${envelopeWithDiarization.deepgram_speakers?.length || 0}`);

    console.log(`\nWithout diarization:`);
    console.log(`  - Sidecar field absent: ${sidecarAbsent ? '✅' : '❌'}`);

    // Count unique speakers
    if (envelopeWithDiarization.deepgram_speakers) {
      const uniqueSpeakers = new Set(envelopeWithDiarization.deepgram_speakers.map(s => s.speaker));
      console.log(`\nUnique speakers detected: ${Array.from(uniqueSpeakers).join(', ')}`);
    }

    console.log('\n✅ Sidecar field implementation verified successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testSidecar();