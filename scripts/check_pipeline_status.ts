#!/usr/bin/env tsx
/**
 * Check the status of the pipeline execution
 */

import * as dotenv from 'dotenv';
import { getStorageClient, StorageClient } from '../src/lib/storage';
import axios from 'axios';

dotenv.config();

async function checkPipelineStatus() {
  const episodeId = 'XWPJS196C945';

  console.log('🔍 Checking Pipeline Status');
  console.log('===========================\n');

  try {
    // Check Inngest event status
    console.log('1️⃣ Checking Inngest Events...');
    try {
      const eventResponse = await axios.get('http://localhost:8288/v0/events', {
        params: { limit: 5 }
      });

      const recentEvents = eventResponse.data?.data || [];
      const ourEvent = recentEvents.find((e: any) =>
        e.name === 'podbean.episode.ingest.requested' &&
        e.data?.episode_id === episodeId
      );

      if (ourEvent) {
        console.log(`   ✅ Event found: ${ourEvent.name}`);
        console.log(`   Event ID: ${ourEvent.id}`);
        console.log(`   Timestamp: ${new Date(ourEvent.ts).toISOString()}`);
      } else {
        console.log('   ⚠️  Event not found in recent events');
      }
    } catch (error: any) {
      console.log(`   ❌ Could not check events: ${error.message}`);
    }

    // Check function runs
    console.log('\n2️⃣ Checking Function Runs...');
    try {
      const runsResponse = await axios.get('http://localhost:8288/v0/runs', {
        params: { limit: 10 }
      });

      const runs = runsResponse.data?.data || [];
      const pipelineRuns = runs.filter((r: any) =>
        r.event_data?.data?.episode_id === episodeId
      );

      if (pipelineRuns.length > 0) {
        console.log(`   Found ${pipelineRuns.length} run(s):`);
        pipelineRuns.forEach((run: any) => {
          console.log(`   - Function: ${run.function_id}`);
          console.log(`     Status: ${run.status}`);
          console.log(`     Started: ${new Date(run.started_at).toISOString()}`);
          if (run.ended_at) {
            console.log(`     Ended: ${new Date(run.ended_at).toISOString()}`);
          }
        });
      } else {
        console.log('   ⚠️  No function runs found');
      }
    } catch (error: any) {
      console.log(`   ❌ Could not check runs: ${error.message}`);
    }

    // Check S3 storage
    console.log('\n3️⃣ Checking S3 Storage...');
    const storage = getStorageClient();

    const transcriptKey = StorageClient.getTranscriptKey(episodeId, 'deepgram');
    const rawKey = StorageClient.getTranscriptKey(episodeId, 'deepgram_raw');

    const transcriptExists = await storage.exists(transcriptKey);
    const rawExists = await storage.exists(rawKey);

    console.log(`   Normalized transcript: ${transcriptExists ? '✅ Exists' : '❌ Not found'}`);
    console.log(`   Raw transcript: ${rawExists ? '✅ Exists' : '❌ Not found'}`);

    if (transcriptExists) {
      // Load and check for sidecar field
      const envelope = await storage.loadJson(transcriptKey);
      console.log(`\n4️⃣ Transcript Analysis:`);
      console.log(`   Episode ID: ${envelope.episode_id}`);
      console.log(`   Words: ${envelope.words?.length || 0}`);
      console.log(`   Utterances: ${envelope.utterances?.length || 0}`);
      console.log(`   Paragraphs: ${envelope.paragraphs?.length || 0}`);
      console.log(`   Deepgram speakers (sidecar): ${envelope.deepgram_speakers ? `✅ ${envelope.deepgram_speakers.length} segments` : '❌ Not present'}`);

      // Verify canonical fields are null
      if (envelope.words && envelope.words.length > 0) {
        const allWordsNull = envelope.words.every((w: any) => w.speaker === null);
        console.log(`   Canonical speaker fields null: ${allWordsNull ? '✅' : '❌'}`);
      }

      if (envelope.deepgram_speakers && envelope.deepgram_speakers.length > 0) {
        console.log(`\n   Sample speaker segments:`);
        envelope.deepgram_speakers.slice(0, 3).forEach((seg: any, i: number) => {
          console.log(`     ${i + 1}. ${seg.speaker} [${seg.start}-${seg.end}s]`);
        });
      }
    }

    // Check all files in the episode directory
    console.log('\n5️⃣ All Files in Episode Directory:');
    const allFiles = await storage.listObjects(`transcripts/${episodeId}/`);
    if (allFiles.length > 0) {
      allFiles.forEach(file => {
        console.log(`   - ${file}`);
      });
    } else {
      console.log('   No files found');
    }

    console.log('\n✅ Status check complete!');

  } catch (error) {
    console.error('\n❌ Error checking status:', error);
  }
}

checkPipelineStatus();