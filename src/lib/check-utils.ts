import { getStorageClient, StorageClient } from "./storage";
import { keys } from "./keys";

export async function checkEnriched(episodeId: string): Promise<void> {
  const storage = getStorageClient();
  const enrichedKey = keys.enriched(episodeId);

  console.log(`Checking enriched transcript for ${episodeId}`);
  console.log(`S3 key: ${enrichedKey}`);

  const enriched =
    await storage.loadJson<Array<Record<string, unknown>>>(enrichedKey);
  const segments = Array.isArray(enriched) ? enriched : [];

  console.log(`Segments: ${segments.length}`);

  if (segments.length > 0) {
    console.log("First segment:", JSON.stringify(segments[0], null, 2));
    console.log(
      "Last segment:",
      JSON.stringify(segments[segments.length - 1], null, 2),
    );
  } else {
    console.log("Enriched transcript is empty");
  }
}

export async function checkRawTranscript(episodeId: string): Promise<void> {
  const storage = getStorageClient();
  const rawKey = StorageClient.getTranscriptKey(episodeId, "deepgram_raw");

  console.log(`Checking raw Deepgram transcript for ${episodeId}`);
  console.log(`S3 key: ${rawKey}`);

  const rawResponse = await storage.loadJson<any>(rawKey);

  const metadataKeys = Object.keys(rawResponse?.metadata || {});
  const resultsKeys = Object.keys(rawResponse?.results || {});

  console.log("Metadata keys:", metadataKeys);
  console.log("Results keys:", resultsKeys);

  const words =
    (rawResponse?.results?.channels?.[0]?.alternatives?.[0]?.words || []) as Array<
      Record<string, unknown>
    >;
  if (words.length > 0) {
    console.log("First word keys:", Object.keys(words[0] || {}));
    console.log(
      "Has speaker field:",
      Object.prototype.hasOwnProperty.call(words[0] || {}, "speaker"),
    );
  }

  const utterances =
    (rawResponse?.results?.utterances || []) as Array<Record<string, unknown>>;
  console.log(`Top-level utterances: ${utterances.length}`);
  if (utterances.length > 0) {
    console.log("First utterance keys:", Object.keys(utterances[0] || {}));
    console.log(
      "Has speaker field:",
      Object.prototype.hasOwnProperty.call(utterances[0] || {}, "speaker"),
    );
  }

  const hasSpeakerInfo = words.some((word: Record<string, unknown>) =>
    Object.prototype.hasOwnProperty.call(word, "speaker"),
  );
  console.log(`Diarization enabled: ${hasSpeakerInfo ? "YES" : "NO"}`);
}
