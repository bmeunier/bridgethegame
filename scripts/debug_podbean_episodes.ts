#!/usr/bin/env npx tsx

/**
 * Debug Podbean episode retrieval to understand available episodes and their IDs
 */

import "dotenv/config";
import { podbeanClient } from "../src/lib/podbean";

async function debugPodbeanEpisodes() {
  console.log("🔍 Debugging Podbean episode retrieval...");

  // Debug environment variables (masked)
  console.log("📋 Environment variables check:");
  console.log(
    `   PODBEAN_CLIENT_ID: ${process.env.PODBEAN_CLIENT_ID ? "SET" : "NOT SET"}`,
  );
  console.log(
    `   PODBEAN_CLIENT_SECRET: ${process.env.PODBEAN_CLIENT_SECRET ? "SET" : "NOT SET"}`,
  );
  console.log(
    `   PODBEAN_ACCESS_TOKEN: ${process.env.PODBEAN_ACCESS_TOKEN ? "SET" : "NOT SET"}`,
  );
  console.log(
    `   PODBEAN_REFRESH_TOKEN: ${process.env.PODBEAN_REFRESH_TOKEN ? "SET" : "NOT SET"}`,
  );

  try {
    // Test client credentials and get episode list
    console.log("\n📋 Fetching episode list from Podbean API...");

    // Get the first few episodes to see what's available
    const episodeList = await (podbeanClient as any).getEpisodeList(0, 10);

    console.log(`\n✅ Found ${episodeList.episodes.length} episodes:`);

    episodeList.episodes.forEach((episode: any, index: number) => {
      console.log(`\n${index + 1}. Episode ID: ${episode.id}`);
      console.log(`   Title: ${episode.title || "No title"}`);
      console.log(`   GUID: ${episode.guid || "No GUID"}`);
      console.log(`   Media URL: ${episode.media_url || "No media URL"}`);
      console.log(
        `   Publish Time: ${episode.publish_time || "No publish time"}`,
      );
      console.log(`   Duration: ${episode.duration || "No duration"}`);

      // Check if media URL contains GUID pattern
      if (episode.media_url) {
        const guidMatch = episode.media_url.match(
          /rss_p_episodes_captivate_fm_episode_([a-f0-9-]+)\.mp3/i,
        );
        if (guidMatch) {
          console.log(`   🎯 Extracted GUID from media URL: ${guidMatch[1]}`);
        }
      }
    });

    // Test fetching one episode by its Podbean ID
    if (episodeList.episodes.length > 0) {
      const firstEpisode = episodeList.episodes[0];
      console.log(
        `\n🧪 Testing direct episode fetch with ID: ${firstEpisode.id}`,
      );

      try {
        const episode = await podbeanClient.getEpisode(firstEpisode.id);
        console.log(`✅ Successfully fetched episode: ${episode.title}`);
        console.log(
          `   Full episode object keys: ${Object.keys(episode).join(", ")}`,
        );
      } catch (error) {
        console.error(`❌ Failed to fetch episode by ID:`, error);
      }
    }

    // Try to find episode WRQZ7196C943 specifically
    console.log(`\n🎯 Searching for episode WRQZ7196C943...`);
    const targetEpisode = episodeList.episodes.find(
      (ep: any) =>
        ep.id === "WRQZ7196C943" ||
        ep.guid === "WRQZ7196C943" ||
        (ep.media_url && ep.media_url.includes("WRQZ7196C943")),
    );

    if (targetEpisode) {
      console.log(`✅ Found WRQZ7196C943:`, targetEpisode);
    } else {
      console.log(`❌ Episode WRQZ7196C943 not found in first 10 episodes`);

      // Try getting more episodes
      console.log(`🔍 Searching in more episodes...`);
      let found = false;
      let offset = 10;

      while (!found && offset < 100) {
        try {
          const moreEpisodes = await (podbeanClient as any).getEpisodeList(
            offset,
            10,
          );
          if (moreEpisodes.episodes.length === 0) break;

          const foundEpisode = moreEpisodes.episodes.find(
            (ep: any) =>
              ep.id === "WRQZ7196C943" ||
              ep.guid === "WRQZ7196C943" ||
              (ep.media_url && ep.media_url.includes("WRQZ7196C943")),
          );

          if (foundEpisode) {
            console.log(
              `✅ Found WRQZ7196C943 at offset ${offset}:`,
              foundEpisode,
            );
            found = true;
          }

          offset += 10;
        } catch (error) {
          console.error(`❌ Error searching at offset ${offset}:`, error);
          break;
        }
      }

      if (!found) {
        console.log(
          `❌ Episode WRQZ7196C943 not found in first ${offset} episodes`,
        );
      }
    }
  } catch (error) {
    console.error("❌ Error debugging Podbean episodes:", error);
  }
}

// Main execution
async function main() {
  try {
    await debugPodbeanEpisodes();
  } catch (error) {
    console.error("❌ Failed to debug Podbean episodes:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
