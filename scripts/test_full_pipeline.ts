#!/usr/bin/env tsx
/**
 * Test the full transcription pipeline with a real Podbean episode
 *
 * Usage:
 *   npx tsx scripts/test_full_pipeline.ts [episode_id]
 *
 * Example:
 *   npx tsx scripts/test_full_pipeline.ts eb5q57pvxpm
 */

import * as dotenv from 'dotenv';
import { podbeanClient } from '../src/lib/podbean';
import { deepgramClient } from '../src/lib/deepgram';
import { getStorageClient, StorageClient } from '../src/lib/storage';

dotenv.config();

async function testFullPipeline() {
  console.log('🚀 Starting Full Pipeline Test');
  console.log('================================\n');

  try {
    // Step 1: Get a specific episode from Podbean
    // Using a known episode ID - you can replace this with a real episode ID
    console.log('📻 Step 1: Fetching episode from Podbean...');

    // You can replace this with a real episode ID from The Game podcast
    const episodeId = process.argv[2] || 'eb5q57pvxpm'; // Example episode ID

    const episode = await podbeanClient.getEpisode(episodeId);
    console.log(`✅ Found episode: "${episode.title}"`);
    console.log(`   ID: ${episode.id}`);
    console.log(`   Duration: ${episode.duration}s`);
    console.log(`   Audio URL: ${episode.media_url}\n`);

    // Step 2: Start transcription
    console.log('🎙️ Step 2: Starting Deepgram transcription...');
    console.log('   This may take a few minutes depending on episode length...');

    const startTime = Date.now();

    // Monitor with progress updates
    let dots = 0;
    const progressInterval = setInterval(() => {
      process.stdout.write('.');
      dots++;
      if (dots % 60 === 0) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        process.stdout.write(` ${elapsed}s`);
        process.stdout.write('\n   ');
      }
    }, 1000);

    try {
      // Call Deepgram
      const response = await deepgramClient.transcribeFromUrl(episode.media_url, {
        model: 'general',
        punctuate: true,
        utterances: true,
        paragraphs: true,
        timestamps: true,
        diarize: false,
        language: 'en',
        smart_format: true,
      });

      clearInterval(progressInterval);
      process.stdout.write('\n');

      const transcriptionTime = Math.round((Date.now() - startTime) / 1000);

      console.log(`✅ Transcription complete in ${transcriptionTime}s`);
      console.log(`   Request ID: ${response.metadata.request_id}`);
      console.log(`   Audio duration: ${response.metadata.duration}s`);
      console.log(`   Processing speed: ${(response.metadata.duration / transcriptionTime).toFixed(2)}x realtime\n`);

      // Step 3: Parse and analyze
      console.log('📝 Step 3: Parsing transcript...');
      const envelope = deepgramClient.parseResponse(episode.id, response);

      console.log(`✅ Transcript parsed successfully`);
      console.log(`   Words: ${envelope.words.length}`);
      console.log(`   Utterances: ${envelope.utterances.length}`);
      console.log(`   Paragraphs: ${envelope.paragraphs.length}`);
      console.log(`   Words per minute: ${Math.round((envelope.words.length / response.metadata.duration) * 60)}\n`);

      // Step 4: Sample output
      console.log('📖 Step 4: Sample transcript:');
      console.log('   First 200 words:');
      const sampleText = envelope.words
        .slice(0, 200)
        .map(w => w.word)
        .join(' ');
      console.log(`\n   "${sampleText}..."\n`);

      // Step 5: Save to S3
      if (process.env.S3_BUCKET_NAME) {
        console.log('💾 Step 5: Saving to S3...');
        const storage = getStorageClient();

        const transcriptKey = StorageClient.getTranscriptKey(episode.id, 'deepgram');
        await storage.saveJson(transcriptKey, envelope);

        const rawKey = StorageClient.getTranscriptKey(episode.id, 'deepgram_raw');
        await storage.saveJson(rawKey, response);

        console.log(`✅ Saved to S3`);
        console.log(`   Transcript: s3://${process.env.S3_BUCKET_NAME}/${transcriptKey}`);
        console.log(`   Raw: s3://${process.env.S3_BUCKET_NAME}/${rawKey}\n`);
      } else {
        console.log('⏭️  Step 5: Skipping S3 save (no bucket configured)\n');
      }

      // Summary statistics
      console.log('📊 Summary Statistics:');
      console.log('================================');
      console.log(`Episode: ${episode.title}`);
      console.log(`Episode ID: ${episode.id}`);
      console.log(`Audio Duration: ${response.metadata.duration}s (${Math.round(response.metadata.duration / 60)} min)`);
      console.log(`Transcription Time: ${transcriptionTime}s`);
      console.log(`Processing Speed: ${(response.metadata.duration / transcriptionTime).toFixed(2)}x realtime`);
      console.log(`Total Words: ${envelope.words.length}`);
      console.log(`Total Utterances: ${envelope.utterances.length}`);
      console.log(`Total Paragraphs: ${envelope.paragraphs.length}`);
      console.log(`Average Confidence: ${(envelope.words.reduce((sum, w) => sum + w.confidence, 0) / envelope.words.length).toFixed(3)}`);
      console.log(`Words per Minute: ${Math.round((envelope.words.length / response.metadata.duration) * 60)}`);

      // Check for any warnings
      if (envelope.words.length === 0) {
        console.warn('⚠️  Warning: No words detected in transcript');
      }

      const lowConfidenceWords = envelope.words.filter(w => w.confidence < 0.5).length;
      if (lowConfidenceWords > 0) {
        console.warn(`⚠️  Warning: ${lowConfidenceWords} words with low confidence (<0.5)`);
      }

      console.log('\n✅ Pipeline test completed successfully!');

    } catch (error) {
      clearInterval(progressInterval);
      process.stdout.write('\n');
      throw error;
    }

  } catch (error) {
    console.error('\n❌ Pipeline test failed:', error);
    if (axios.isAxiosError(error)) {
      console.error('API Error Details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
    }
    process.exit(1);
  }
}

// Add axios import for error checking
import axios from 'axios';

// Run the test
console.log('Checking environment...');
if (!process.env.DEEPGRAM_API_KEY) {
  console.error('❌ DEEPGRAM_API_KEY not configured in .env');
  process.exit(1);
}
if (!process.env.PODBEAN_ACCESS_TOKEN) {
  console.error('❌ PODBEAN_ACCESS_TOKEN not configured in .env');
  console.log('   Run the Podbean auth flow first to get tokens');
  process.exit(1);
}

testFullPipeline().catch(console.error);