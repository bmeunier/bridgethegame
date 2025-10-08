/**
 * Storage utilities for S3 operations
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";

export class StorageClient {
  private s3: S3Client;
  private bucketName: string;

  constructor(bucketName?: string, region?: string) {
    this.bucketName = bucketName || process.env.S3_BUCKET_NAME || "";
    const awsRegion = region || process.env.AWS_REGION || "us-east-1";

    if (!this.bucketName) {
      throw new Error("S3_BUCKET_NAME is required");
    }

    // Initialize S3 client
    this.s3 = new S3Client({
      region: awsRegion,
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined, // Use default credentials chain (EC2, ECS, Lambda roles, etc.)
    });
  }

  /**
   * Save JSON object to S3
   */
  async saveJson(key: string, data: any): Promise<void> {
    const jsonString = JSON.stringify(data, null, 2);

    try {
      console.log(
        JSON.stringify({
          scope: "storage_client",
          action: "save_json_start",
          bucket: this.bucketName,
          key,
          size: jsonString.length,
        }),
      );

      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: jsonString,
          ContentType: "application/json",
        }),
      );

      console.log(
        JSON.stringify({
          scope: "storage_client",
          action: "save_json_success",
          bucket: this.bucketName,
          key,
        }),
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          scope: "storage_client",
          action: "save_json_error",
          bucket: this.bucketName,
          key,
          error: error instanceof Error ? error.message : error,
        }),
      );
      throw error;
    }
  }

  /**
   * Load JSON object from S3
   */
  async loadJson<T = any>(key: string): Promise<T> {
    try {
      console.log(
        JSON.stringify({
          scope: "storage_client",
          action: "load_json_start",
          bucket: this.bucketName,
          key,
        }),
      );

      const response = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );

      if (!response.Body) {
        throw new Error("Empty response body");
      }

      const bodyString = await this.streamToString(response.Body as Readable);
      const data = JSON.parse(bodyString) as T;

      console.log(
        JSON.stringify({
          scope: "storage_client",
          action: "load_json_success",
          bucket: this.bucketName,
          key,
          size: bodyString.length,
        }),
      );

      return data;
    } catch (error) {
      console.error(
        JSON.stringify({
          scope: "storage_client",
          action: "load_json_error",
          bucket: this.bucketName,
          key,
          error: error instanceof Error ? error.message : error,
        }),
      );
      throw error;
    }
  }

  /**
   * Check if object exists in S3
   */
  async exists(key: string): Promise<boolean> {
    try {
      await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      return true;
    } catch (error: any) {
      if (
        error.name === "NotFound" ||
        error.$metadata?.httpStatusCode === 404
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * List objects with prefix
   */
  async listObjects(prefix: string, maxKeys: number = 1000): Promise<string[]> {
    try {
      console.log(
        JSON.stringify({
          scope: "storage_client",
          action: "list_objects_start",
          bucket: this.bucketName,
          prefix,
          max_keys: maxKeys,
        }),
      );

      const response = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: prefix,
          MaxKeys: maxKeys,
        }),
      );

      const keys =
        response.Contents?.map((item) => item.Key!).filter(Boolean) || [];

      console.log(
        JSON.stringify({
          scope: "storage_client",
          action: "list_objects_success",
          bucket: this.bucketName,
          prefix,
          count: keys.length,
        }),
      );

      return keys;
    } catch (error) {
      console.error(
        JSON.stringify({
          scope: "storage_client",
          action: "list_objects_error",
          bucket: this.bucketName,
          prefix,
          error: error instanceof Error ? error.message : error,
        }),
      );
      throw error;
    }
  }

  /**
   * Save audio buffer to S3
   */
  async saveAudio(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    try {
      console.log(
        JSON.stringify({
          scope: "storage_client",
          action: "save_audio_start",
          bucket: this.bucketName,
          key,
          size: buffer.length,
          content_type: contentType,
        }),
      );

      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }),
      );

      console.log(
        JSON.stringify({
          scope: "storage_client",
          action: "save_audio_success",
          bucket: this.bucketName,
          key,
        }),
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          scope: "storage_client",
          action: "save_audio_error",
          bucket: this.bucketName,
          key,
          error: error instanceof Error ? error.message : error,
        }),
      );
      throw error;
    }
  }

  /**
   * Get audio buffer from S3
   */
  async getAudio(key: string): Promise<Buffer> {
    try {
      console.log(
        JSON.stringify({
          scope: "storage_client",
          action: "get_audio_start",
          bucket: this.bucketName,
          key,
        }),
      );

      const response = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );

      if (!response.Body) {
        throw new Error("Empty response body");
      }

      const chunks: Buffer[] = [];
      for await (const chunk of response.Body as Readable) {
        chunks.push(Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);

      console.log(
        JSON.stringify({
          scope: "storage_client",
          action: "get_audio_success",
          bucket: this.bucketName,
          key,
          size: buffer.length,
        }),
      );

      return buffer;
    } catch (error) {
      console.error(
        JSON.stringify({
          scope: "storage_client",
          action: "get_audio_error",
          bucket: this.bucketName,
          key,
          error: error instanceof Error ? error.message : error,
        }),
      );
      throw error;
    }
  }

  /**
   * Helper: Convert stream to string
   */
  private async streamToString(stream: Readable): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf-8");
  }

  /**
   * Delete object from S3
   */
  async deleteObject(key: string): Promise<void> {
    try {
      console.log(
        JSON.stringify({
          scope: "storage_client",
          action: "delete_start",
          bucket: this.bucketName,
          key,
        }),
      );

      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );

      console.log(
        JSON.stringify({
          scope: "storage_client",
          action: "delete_success",
          bucket: this.bucketName,
          key,
        }),
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          scope: "storage_client",
          action: "delete_error",
          bucket: this.bucketName,
          key,
          error: error instanceof Error ? error.message : error,
        }),
      );
      throw error;
    }
  }

  /**
   * Generate S3 key for transcript files
   */
  static getTranscriptKey(
    episodeId: string,
    type: "deepgram" | "deepgram_raw" | "pyannote" | "final",
  ): string {
    return `transcripts/${episodeId}/${type}.json`;
  }

  /**
   * Generate S3 key for audio files
   */
  static getAudioKey(episodeId: string): string {
    return `audio/${episodeId}/episode.mp3`;
  }

  /**
   * Generate a pre-signed URL for temporary public access
   */
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      const signedUrl = await getSignedUrl(this.s3, command, { expiresIn });

      console.log(
        JSON.stringify({
          scope: "storage_client",
          action: "signed_url_generated",
          bucket: this.bucketName,
          key,
          expires_in: expiresIn,
        }),
      );

      return signedUrl;
    } catch (error) {
      console.error(
        JSON.stringify({
          scope: "storage_client",
          action: "signed_url_error",
          bucket: this.bucketName,
          key,
          error: error instanceof Error ? error.message : error,
        }),
      );
      throw error;
    }
  }
}

// Export singleton instance (will be initialized with env vars)
let storageClient: StorageClient | null = null;

export function getStorageClient(): StorageClient {
  if (!storageClient) {
    storageClient = new StorageClient();
  }
  return storageClient;
}
