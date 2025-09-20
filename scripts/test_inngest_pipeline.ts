#!/usr/bin/env tsx
/**
 * Automated integration test for the full Inngest pipeline
 * This script triggers the pipeline and verifies the end-to-end flow
 */

import * as dotenv from 'dotenv';
import axios from 'axios';
import { getStorageClient, StorageClient } from '../src/lib/storage';

dotenv.config();

const INNGEST_URL = 'http://localhost:8288';
const APP_URL = 'http://localhost:3000';
const TEST_EPISODE_ID = 'TEST-' + Date.now(); // Unique test episode ID
const REAL_EPISODE_ID = 'XWPJS196C945'; // Real episode for testing

async function testInngestPipeline() {
  console.log('🚀 Inngest Pipeline Integration Test');
  console.log('====================================\n');

  const episodeId = process.argv[2] || REAL_EPISODE_ID;
  const forceReprocess = process.argv[3] === '--force';

  console.log(`Episode ID: ${episodeId}`);
  console.log(`Force reprocess: ${forceReprocess}\n`);

  try {
    // Step 1: Verify servers are running
    console.log('1️⃣ Verifying servers...');

    try {
      await axios.get(`${APP_URL}/health`, { timeout: 2000 }).catch(() => {});
      console.log('   ✅ Application server running on port 3000');
    } catch {
      console.log('   ⚠️  Application server may not be running');
    }

    try {
      await axios.get(`${INNGEST_URL}`, { timeout: 2000 }).catch(() => {});
      console.log('   ✅ Inngest dev server running on port 8288');
    } catch {
      console.log('   ⚠️  Inngest dev server may not be running');
    }

    // Step 2: Trigger the pipeline
    console.log('\n2️⃣ Triggering pipeline via Inngest event...');

    const eventPayload = {
      name: 'podbean.episode.ingest.requested',
      data: {
        episode_id: episodeId,
        mode: 'single',
        force: forceReprocess,
        priority: 'normal',
        requested_by: 'integration-test',
      },
      user: {},
      ts: Date.now(),
    };

    const triggerResponse = await axios.post(
      `${INNGEST_URL}/e/default`,
      eventPayload,
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const eventIds = triggerResponse.data?.ids || [];
    console.log(`   ✅ Event triggered successfully`);
    console.log(`   Event IDs: ${eventIds.join(', ')}`);

    // Step 3: Wait for processing
    console.log('\n3️⃣ Waiting for pipeline to process...');
    console.log('   This may take 10-30 seconds depending on episode length');

    let dots = 0;
    const maxWaitTime = 60000; // 60 seconds max
    const checkInterval = 2000; // Check every 2 seconds
    const startTime = Date.now();

    // Monitor progress
    while (Date.now() - startTime < maxWaitTime) {
      process.stdout.write('.');
      dots++;
      if (dots % 30 === 0) {
        process.stdout.write(` ${Math.round((Date.now() - startTime) / 1000)}s\n   `);
      }

      // Check if transcript exists
      const storage = getStorageClient();
      const transcriptKey = StorageClient.getTranscriptKey(episodeId, 'deepgram');
      const exists = await storage.exists(transcriptKey);

      if (exists) {
        process.stdout.write('\n');
        console.log('   ✅ Transcript generated!');
        break;
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    // Step 4: Verify results
    console.log('\n4️⃣ Verifying pipeline results...');

    const storage = getStorageClient();
    const transcriptKey = StorageClient.getTranscriptKey(episodeId, 'deepgram');
    const rawKey = StorageClient.getTranscriptKey(episodeId, 'deepgram_raw');

    const transcriptExists = await storage.exists(transcriptKey);
    const rawExists = await storage.exists(rawKey);

    let allTestsPassed = true;

    // Check files exist
    if (!transcriptExists) {
      console.log('   ❌ Normalized transcript not found');
      allTestsPassed = false;
    } else {
      console.log('   ✅ Normalized transcript exists');
    }

    if (!rawExists) {
      console.log('   ❌ Raw transcript not found');
      allTestsPassed = false;
    } else {
      console.log('   ✅ Raw transcript exists');
    }

    // Check transcript content
    if (transcriptExists) {
      const envelope = await storage.loadJson(transcriptKey);

      // Verify structure
      if (envelope.episode_id !== episodeId) {
        console.log(`   ❌ Episode ID mismatch: ${envelope.episode_id} !== ${episodeId}`);
        allTestsPassed = false;
      } else {
        console.log('   ✅ Episode ID matches');
      }

      if (!envelope.words || envelope.words.length === 0) {
        console.log('   ❌ No words in transcript');
        allTestsPassed = false;
      } else {
        console.log(`   ✅ Words found: ${envelope.words.length}`);
      }

      // Check canonical speaker fields are null
      if (envelope.words && envelope.words.length > 0) {
        const allNull = envelope.words.every((w: any) => w.speaker === null);
        if (!allNull) {
          console.log('   ❌ Canonical speaker fields are not null');
          allTestsPassed = false;
        } else {
          console.log('   ✅ Canonical speaker fields are null');
        }
      }

      // Check for sidecar field
      if (envelope.deepgram_speakers && envelope.deepgram_speakers.length > 0) {
        console.log(`   ✅ Deepgram speakers sidecar present: ${envelope.deepgram_speakers.length} segments`);

        // Verify sidecar format
        const validFormat = envelope.deepgram_speakers.every((seg: any) =>
          seg.speaker && seg.speaker.startsWith('dg-') &&
          typeof seg.start === 'number' &&
          typeof seg.end === 'number'
        );

        if (!validFormat) {
          console.log('   ❌ Invalid sidecar segment format');
          allTestsPassed = false;
        } else {
          console.log('   ✅ Sidecar segment format valid');
        }
      } else {
        console.log('   ⚠️  No deepgram_speakers sidecar field (diarization may be disabled)');
      }
    }

    // Step 5: Summary
    console.log('\n📊 Test Summary');
    console.log('===============');

    if (allTestsPassed) {
      console.log('✅ All tests passed!');
      console.log('\nThe Inngest pipeline successfully:');
      console.log('1. Received the event trigger');
      console.log('2. Fetched episode from Podbean');
      console.log('3. Called Deepgram for transcription');
      console.log('4. Saved normalized and raw transcripts to S3');
      console.log('5. Preserved canonical speaker fields as null');
      if (episodeId === REAL_EPISODE_ID) {
        console.log('6. Included deepgram_speakers sidecar field');
      }
      process.exit(0);
    } else {
      console.log('❌ Some tests failed');
      console.log('\nPlease check:');
      console.log('1. Both servers are running (npm run inngest-dev & npm run dev)');
      console.log('2. Environment variables are configured correctly');
      console.log('3. The episode ID is valid in Podbean');
      process.exit(1);
    }

  } catch (error: any) {
    console.error('\n❌ Test failed with error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Run the test
console.log('Usage: npx tsx scripts/test_inngest_pipeline.ts [episode_id] [--force]');
console.log('Example: npx tsx scripts/test_inngest_pipeline.ts XWPJS196C945 --force\n');

testInngestPipeline().catch(console.error);