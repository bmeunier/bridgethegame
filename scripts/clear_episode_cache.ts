#!/usr/bin/env npx tsx

/**
 * Clear all cached data for a specific episode to enable fresh pipeline testing
 * Usage: npx tsx scripts/clear_episode_cache.ts <episode_id>
 */

import "dotenv/config";
import { getStorageClient } from "../src/lib/storage";

async function clearEpisodeCache(episodeId: string) {
  console.log(`🧹 Clearing all cached data for episode: ${episodeId}`);

  const storage = getStorageClient();

  // Define all possible storage keys for this episode
  const keysToDelete = [
    // Transcript files
    `transcripts/${episodeId}/deepgram.json`,
    `transcripts/${episodeId}/deepgram_raw.json`,
    `transcripts/${episodeId}/diarization.json`,
    `transcripts/${episodeId}/enriched.json`,
    `transcripts/${episodeId}/pyannote_audit.json`,
    `transcripts/${episodeId}/final.json`,

    // Audio files
    `audio/${episodeId}/episode.mp3`,

    // Any other potential cache files
    `cache/${episodeId}.json`,
    `episodes/${episodeId}.json`,
  ];

  console.log(`📋 Checking ${keysToDelete.length} potential storage keys...`);

  let deletedCount = 0;
  let skippedCount = 0;

  for (const key of keysToDelete) {
    try {
      // Check if the object exists
      const exists = await storage.exists(key);

      if (exists) {
        console.log(`🗑️  Deleting: ${key}`);
        await storage.deleteObject(key);
        deletedCount++;
      } else {
        console.log(`⏭️  Skipping (not found): ${key}`);
        skippedCount++;
      }
    } catch (error) {
      console.error(`❌ Error handling ${key}:`, error);
    }
  }

  // Also list and delete any other files in the transcripts/episodeId/ directory
  try {
    console.log(
      `🔍 Scanning for additional files in transcripts/${episodeId}/...`,
    );
    const transcriptFiles = await storage.listObjects(
      `transcripts/${episodeId}/`,
    );

    for (const file of transcriptFiles) {
      if (!keysToDelete.includes(file)) {
        console.log(`🗑️  Deleting additional file: ${file}`);
        await storage.deleteObject(file);
        deletedCount++;
      }
    }
  } catch (error) {
    console.error(`❌ Error scanning transcript directory:`, error);
  }

  // Scan audio directory
  try {
    console.log(`🔍 Scanning for additional files in audio/${episodeId}/...`);
    const audioFiles = await storage.listObjects(`audio/${episodeId}/`);

    for (const file of audioFiles) {
      if (!keysToDelete.includes(file)) {
        console.log(`🗑️  Deleting additional audio file: ${file}`);
        await storage.deleteObject(file);
        deletedCount++;
      }
    }
  } catch (error) {
    console.error(`❌ Error scanning audio directory:`, error);
  }

  console.log(`\n✅ Cache clearing complete for episode ${episodeId}`);
  console.log(`   📊 Files deleted: ${deletedCount}`);
  console.log(`   📊 Files skipped (not found): ${skippedCount}`);
  console.log(
    `\n🚀 Episode ${episodeId} is now ready for fresh pipeline processing!`,
  );
}

// Main execution
async function main() {
  const episodeId = process.argv[2];

  if (!episodeId) {
    console.error(
      "❌ Usage: npx tsx scripts/clear_episode_cache.ts <episode_id>",
    );
    console.error(
      "   Example: npx tsx scripts/clear_episode_cache.ts WRQZ7196C943",
    );
    process.exit(1);
  }

  if (episodeId.length < 5) {
    console.error("❌ Episode ID seems too short. Please double-check the ID.");
    process.exit(1);
  }

  try {
    await clearEpisodeCache(episodeId);
  } catch (error) {
    console.error("❌ Failed to clear episode cache:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
