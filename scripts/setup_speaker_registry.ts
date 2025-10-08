/**
 * Setup script for speaker registry and Pyannote voice profiles
 *
 * This script:
 * 1. Uploads the speaker registry to S3
 * 2. Creates voice profiles in Pyannote using the voice samples
 * 3. Updates the registry with the actual Pyannote reference IDs
 */

import * as dotenv from "dotenv";
import { getStorageClient } from "../src/lib/storage";
import { SpeakerRegistry } from "../src/types/pyannote";
import {
  createVoiceprintFromMultipleSamples,
  generateReferenceId,
} from "../src/lib/pyannote-enrollment";
import * as fs from "fs";
import * as path from "path";

// Load environment variables
dotenv.config();

/**
 * Create a voice profile in Pyannote using audio samples
 */
async function createPyannoteVoiceProfile(
  samples: string[],
  profileName: string,
  apiKey: string,
): Promise<string> {
  console.log(`🎤 Creating real Pyannote voice profile for ${profileName}...`);

  try {
    // Generate a reference ID
    const referenceId = generateReferenceId(profileName);

    console.log(`   ✓ Generated reference ID: ${referenceId}`);
    console.log(`   ✓ Processing ${samples.length} voice samples...`);

    // Convert S3 URLs to signed URLs for Pyannote API access
    const storage = getStorageClient();
    const signedUrls: string[] = [];

    for (const s3Url of samples) {
      // Extract S3 key from the URL (remove s3://bucket-name/ prefix)
      const s3Key = s3Url.replace(/^s3:\/\/[^\/]+\//, "");

      console.log(`   ⏳ Generating signed URL for: ${s3Key}`);

      try {
        const signedUrl = await storage.getSignedUrl(s3Key, 7200); // 2 hours expiry
        signedUrls.push(signedUrl);
        console.log(`   ✓ Signed URL created (expires in 2 hours)`);
      } catch (error) {
        console.error(
          `   ❌ Failed to generate signed URL for ${s3Key}:`,
          error,
        );
        throw error;
      }
    }

    // Create voiceprint from multiple samples using signed URLs
    const voiceprint = await createVoiceprintFromMultipleSamples(
      signedUrls,
      apiKey,
      profileName,
      { model: "precision-2" }, // Use highest precision model
    );

    console.log(`   ✓ Voice profile created successfully`);
    console.log(`   ✓ Voiceprint size: ${voiceprint.length} characters`);

    // Store the voiceprint for later use in identification
    // We'll save it to S3 for retrieval during speaker identification
    const storageClient = getStorageClient();
    const voiceprintKey = `voiceprints/profiles/${referenceId}.json`;

    await storageClient.saveJson(voiceprintKey, {
      referenceId,
      speakerName: profileName,
      voiceprint,
      samples,
      createdAt: new Date().toISOString(),
      model: "precision-2",
    });

    console.log(
      `   ✓ Voiceprint stored at: s3://${process.env.S3_BUCKET_NAME}/${voiceprintKey}`,
    );

    return referenceId;
  } catch (error) {
    console.error(
      `   ❌ Failed to create voice profile for ${profileName}:`,
      error,
    );
    throw error;
  }
}

/**
 * Setup the complete speaker registry
 */
async function setupSpeakerRegistry() {
  console.log("🔧 Setting up Speaker Registry for The Game podcast\n");

  try {
    // 1. Load the registry configuration
    console.log("1️⃣  Loading speaker registry configuration...");
    const registryPath = path.join(
      __dirname,
      "../config/speaker-registry.json",
    );
    const registryConfig = JSON.parse(fs.readFileSync(registryPath, "utf8"));

    console.log(`   ✓ Loaded registry for podcast: askthegame`);
    console.log(
      `   ✓ Found speaker: ${Object.keys(registryConfig.askthegame)[0]}`,
    );

    // 2. Create voice profiles in Pyannote
    console.log("\n2️⃣  Creating Pyannote voice profiles...");

    const updatedRegistry: SpeakerRegistry = { askthegame: {} };

    for (const [speakerKey, speakerInfo] of Object.entries(
      registryConfig.askthegame,
    )) {
      const speaker = speakerInfo as any; // Type assertion for configuration data
      console.log(`\n   Processing ${speakerKey} (${speaker.displayName})...`);

      // Create voice profile using the samples
      const referenceId = await createPyannoteVoiceProfile(
        speaker.voiceSamples,
        speaker.displayName,
        process.env.PYANNOTE_API_KEY!,
      );

      // Update registry with actual Pyannote reference ID
      updatedRegistry.askthegame[speakerKey] = {
        displayName: speaker.displayName,
        referenceId: referenceId,
        threshold: speaker.threshold,
      };

      console.log(
        `   ✓ Updated registry entry with reference ID: ${referenceId}`,
      );
    }

    // 3. Upload registry to S3
    console.log("\n3️⃣  Uploading speaker registry to S3...");

    const storage = getStorageClient();
    const registryKey = "speaker-registry/askthegame.json";

    await storage.saveJson(registryKey, updatedRegistry);

    console.log(
      `   ✓ Registry uploaded to: s3://${process.env.S3_BUCKET_NAME}/${registryKey}`,
    );

    // 4. Verify the setup
    console.log("\n4️⃣  Verifying setup...");

    const { getSpeakerRegistry } = await import("../src/lib/speaker-utils");
    const loadedRegistry = await getSpeakerRegistry("askthegame");

    console.log(`   ✓ Registry loaded successfully`);
    console.log(
      `   ✓ Found ${Object.keys(loadedRegistry).length} registered speakers`,
    );

    for (const [key, info] of Object.entries(loadedRegistry)) {
      console.log(
        `   ✓ ${key}: ${info.displayName} (threshold: ${info.threshold})`,
      );
    }

    console.log("\n✅ Speaker Registry Setup Complete!");
    console.log("\n📋 Summary:");
    console.log(
      `   • Registry location: s3://${process.env.S3_BUCKET_NAME}/${registryKey}`,
    );
    console.log(
      `   • Speakers configured: ${Object.keys(updatedRegistry.askthegame).length}`,
    );
    console.log(`   • Voice samples processed: 3 files`);
    console.log(`   • Pyannote profiles: Ready for diarization`);

    console.log("\n🎙️  Next Steps:");
    console.log("   1. Test with a real episode: npm run trigger");
    console.log("   2. Check the enriched transcript for speaker labels");
    console.log("   3. Tune thresholds based on accuracy results");
  } catch (error) {
    console.error("❌ Setup failed:", error);
    process.exit(1);
  }
}

/**
 * Alternative: Quick setup with existing voice profile
 * Use this if you already have a Pyannote reference ID
 */
async function quickSetupWithExistingProfile() {
  console.log("⚡ Quick setup with existing Pyannote profile...");

  const quickRegistry: SpeakerRegistry = {
    askthegame: {
      ALEX_HORMOZI: {
        displayName: "Alex Hormozi",
        referenceId: "alex_hormozi_voice_profile", // Replace with actual Pyannote reference ID
        threshold: 0.85,
      },
    },
  };

  const storage = getStorageClient();
  await storage.saveJson("speaker-registry/askthegame.json", quickRegistry);

  console.log("✅ Quick registry setup complete!");
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--quick")) {
    await quickSetupWithExistingProfile();
  } else {
    await setupSpeakerRegistry();
  }
}

main().catch(console.error);
