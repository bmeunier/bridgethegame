#!/usr/bin/env tsx
/**
 * Debug script to see the raw episode data from Podbean
 */

import * as dotenv from 'dotenv';
import { podbeanClient } from '../src/lib/podbean';

dotenv.config();

async function debugEpisode() {
  const episodeId = process.argv[2] || 'XWPJS196C945';

  console.log(`Fetching episode ${episodeId}...`);

  try {
    const episode = await podbeanClient.getEpisode(episodeId);

    console.log('\nRaw Episode Data:');
    console.log('==================');
    console.log(JSON.stringify(episode, null, 2));

    console.log('\nKey Fields:');
    console.log('===========');
    console.log(`Title: ${episode.title}`);
    console.log(`ID: ${episode.id}`);
    console.log(`Duration: ${episode.duration}`);
    console.log(`audio_url: ${episode.audio_url}`);
    console.log(`publish_time: ${episode.publish_time}`);

    // Check for other possible audio URL fields
    const possibleAudioFields = ['audio_url', 'media_url', 'player_url', 'content_url', 'permalink_url'];
    console.log('\nChecking for audio URL fields:');
    possibleAudioFields.forEach(field => {
      if (episode[field]) {
        console.log(`  ${field}: ${episode[field]}`);
      }
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

debugEpisode();