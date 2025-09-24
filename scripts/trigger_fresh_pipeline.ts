#!/usr/bin/env npx tsx

/**
 * Trigger a fresh pipeline run for episode testing
 * Usage: npx tsx scripts/trigger_fresh_pipeline.ts <episode_id>
 */

import 'dotenv/config';
import { inngest } from '../src/inngest/client';

export async function triggerEpisode(episodeId: string) {
  console.log(`🚀 Triggering fresh pipeline for episode: ${episodeId}`);

  try {
    // Send the episode ingest event
    const ingestEvent = await inngest.send({
      name: "podbean.episode.ingest.requested",
      data: {
        episode_id: episodeId,
        force: true,
        mode: "fresh_test",
        requested_by: "fresh_pipeline_test",
        timestamp: Date.now()
      }
    });

    console.log(`✅ Episode ingest event sent successfully:`);
    console.log(`   Event IDs: ${ingestEvent.ids.join(', ')}`);
    console.log(`   🎯 Episode: ${episodeId}`);
    console.log(`   🔄 Mode: Fresh test (force=true)`);
    console.log(`   📅 Timestamp: ${new Date().toISOString()}`);

    console.log(`\n🔍 Monitor progress at: http://localhost:8288/runs`);
    console.log(`\n📋 Expected pipeline flow:`);
    console.log(`   1. ✅ Ingest Episode (Podbean API)`);
    console.log(`   2. 🔄 Transcribe Episode (Deepgram API)`);
    console.log(`   3. 🔄 Diarize Episode (Pyannote API) <- This will test our step output fix!`);

    return ingestEvent;
  } catch (error) {
    console.error(`❌ Failed to trigger fresh pipeline:`, error);
    throw error;
  }
}

// Main execution
async function main() {
  const episodeId = process.argv[2];

  if (!episodeId) {
    console.error('❌ Usage: npx tsx scripts/trigger_fresh_pipeline.ts <episode_id>');
    console.error('   Example: npx tsx scripts/trigger_fresh_pipeline.ts WRQZ7196C943');
    process.exit(1);
  }

  if (episodeId.length < 5) {
    console.error('❌ Episode ID seems too short. Please double-check the ID.');
    process.exit(1);
  }

  try {
    await triggerEpisode(episodeId);
    console.log(`\n🎉 Fresh pipeline triggered successfully for episode ${episodeId}!`);
  } catch (error) {
    console.error('❌ Failed to trigger fresh pipeline:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
