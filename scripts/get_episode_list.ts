#!/usr/bin/env tsx
/**
 * Get list of episodes from Podbean to find valid episode IDs
 */

import * as dotenv from "dotenv";
import axios from "axios";

dotenv.config();

async function getEpisodeList() {
  const accessToken = process.env.PODBEAN_ACCESS_TOKEN;

  if (!accessToken) {
    console.error("PODBEAN_ACCESS_TOKEN not set");
    process.exit(1);
  }

  try {
    // Get episodes from The Game podcast
    const response = await axios.get("https://api.podbean.com/v1/episodes", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        limit: 5, // Get 5 recent episodes
      },
    });

    console.log("Recent Episodes from Podbean:\n");
    response.data.episodes?.forEach((episode: any, index: number) => {
      console.log(`${index + 1}. ${episode.title}`);
      console.log(`   ID: ${episode.id}`);
      console.log(`   Duration: ${Math.round(episode.duration / 60)} minutes`);
      console.log(
        `   Published: ${new Date(episode.publish_time * 1000).toLocaleDateString()}`,
      );
      console.log("");
    });

    if (response.data.episodes?.length > 0) {
      console.log(`\nTo test transcription, run:`);
      console.log(
        `npx tsx scripts/test_full_pipeline.ts ${response.data.episodes[0].id}`,
      );
    }
  } catch (error: any) {
    console.error(
      "Failed to get episodes:",
      error.response?.data || error.message,
    );
    if (error.response?.status === 401) {
      console.log(
        "\nYour access token may have expired. You may need to refresh it.",
      );
    }
  }
}

getEpisodeList();
