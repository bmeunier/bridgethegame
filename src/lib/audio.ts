/**
 * Audio fetching and processing utilities
 */

import axios from "axios";
import { getStorageClient, StorageClient } from "./storage";

export class AudioFetcher {
  private storage: StorageClient;

  constructor(storageClient?: StorageClient) {
    this.storage = storageClient || getStorageClient();
  }

  /**
   * Fetch audio from URL and optionally cache in S3
   */
  async fetchAudioFromUrl(
    audioUrl: string,
    episodeId?: string,
    cacheInS3: boolean = true,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    try {
      console.log(
        JSON.stringify({
          scope: "audio_fetcher",
          action: "fetch_start",
          audio_url: audioUrl,
          episode_id: episodeId,
          cache_in_s3: cacheInS3,
        }),
      );

      // Check if already cached in S3
      if (episodeId && cacheInS3) {
        const s3Key = StorageClient.getAudioKey(episodeId);
        const exists = await this.storage.exists(s3Key);

        if (exists) {
          console.log(
            JSON.stringify({
              scope: "audio_fetcher",
              action: "cache_hit",
              s3_key: s3Key,
            }),
          );

          const buffer = await this.storage.getAudio(s3Key);
          return {
            buffer,
            contentType: "audio/mpeg", // Assume MP3 for cached files
          };
        }
      }

      // Fetch from URL
      const response = await axios.get(audioUrl, {
        responseType: "arraybuffer",
        timeout: 300000, // 5 minutes timeout for large files
        maxContentLength: 500 * 1024 * 1024, // 500MB max
        headers: {
          "User-Agent": "BridgeTheGame/1.0",
        },
      });

      const buffer = Buffer.from(response.data);
      const contentType = response.headers["content-type"] || "audio/mpeg";

      console.log(
        JSON.stringify({
          scope: "audio_fetcher",
          action: "fetch_success",
          audio_url: audioUrl,
          size: buffer.length,
          content_type: contentType,
        }),
      );

      // Cache in S3 if requested
      if (episodeId && cacheInS3) {
        const s3Key = StorageClient.getAudioKey(episodeId);
        await this.storage.saveAudio(s3Key, buffer, contentType);

        console.log(
          JSON.stringify({
            scope: "audio_fetcher",
            action: "cache_saved",
            s3_key: s3Key,
          }),
        );
      }

      return { buffer, contentType };
    } catch (error) {
      console.error(
        JSON.stringify({
          scope: "audio_fetcher",
          action: "fetch_error",
          audio_url: audioUrl,
          error: error instanceof Error ? error.message : error,
        }),
      );

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          throw new Error(`Audio not found at URL: ${audioUrl}`);
        }
        if (error.code === "ECONNABORTED") {
          throw new Error(`Audio fetch timeout for URL: ${audioUrl}`);
        }
      }
      throw error;
    }
  }

  /**
   * Get audio buffer from S3 cache
   */
  async getAudioFromCache(episodeId: string): Promise<Buffer> {
    const s3Key = StorageClient.getAudioKey(episodeId);
    return await this.storage.getAudio(s3Key);
  }

  /**
   * Check if audio is cached in S3
   */
  async isAudioCached(episodeId: string): Promise<boolean> {
    const s3Key = StorageClient.getAudioKey(episodeId);
    return await this.storage.exists(s3Key);
  }

  /**
   * Validate audio URL format
   */
  static isValidAudioUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return ["http:", "https:"].includes(parsedUrl.protocol);
    } catch {
      return false;
    }
  }

  /**
   * Extract content type from URL or default to audio/mpeg
   */
  static getContentTypeFromUrl(url: string): string {
    const extension = url.split(".").pop()?.toLowerCase();
    switch (extension) {
      case "mp3":
        return "audio/mpeg";
      case "wav":
        return "audio/wav";
      case "mp4":
      case "m4a":
        return "audio/mp4";
      case "ogg":
        return "audio/ogg";
      case "webm":
        return "audio/webm";
      default:
        return "audio/mpeg"; // Default to MP3
    }
  }
}

// Export singleton instance (lazy initialization)
let _audioFetcher: AudioFetcher | null = null;

export function getAudioFetcher(): AudioFetcher {
  if (!_audioFetcher) {
    _audioFetcher = new AudioFetcher();
  }
  return _audioFetcher;
}

// Export for backward compatibility
export const audioFetcher = {
  fetchAudioFromUrl: (...args: Parameters<AudioFetcher["fetchAudioFromUrl"]>) =>
    getAudioFetcher().fetchAudioFromUrl(...args),
  getAudioFromCache: (...args: Parameters<AudioFetcher["getAudioFromCache"]>) =>
    getAudioFetcher().getAudioFromCache(...args),
  isAudioCached: (...args: Parameters<AudioFetcher["isAudioCached"]>) =>
    getAudioFetcher().isAudioCached(...args),
};
