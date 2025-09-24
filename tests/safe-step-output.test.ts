/**
 * Unit tests for safe step output utilities
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { safeStepOutput, wouldExceedStepLimit, minimalStepResult } from '../src/lib/safe_step_output';
import * as storageSafe from '../src/lib/storage_safe';

// Mock the storage module
jest.mock('../src/lib/storage_safe');

describe('Safe Step Output', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('safeStepOutput', () => {
    it('should save data to storage and return minimal metadata', async () => {
      const mockSaveJson = jest.spyOn(storageSafe, 'saveJson').mockResolvedValue();

      const testData = { foo: 'bar', items: [1, 2, 3] };
      const result = await safeStepOutput('test-key', testData, { extra: 'metadata' });

      expect(mockSaveJson).toHaveBeenCalledWith('test-key', testData);
      expect(result).toEqual({
        storage_key: 'test-key',
        metadata: {
          extra: 'metadata',
          bytes: expect.any(Number),
          forced_storage: false,
        },
        size: expect.any(Number),
      });
    });

    it('should force storage for large payloads', async () => {
      const mockSaveJson = jest.spyOn(storageSafe, 'saveJson').mockResolvedValue();

      // Create a large payload (> 100KB)
      const largeArray = Array(50000).fill('x');
      const largeData = { data: largeArray.join('') };

      const result = await safeStepOutput('large-key', largeData);

      expect(mockSaveJson).toHaveBeenCalledWith('large-key', largeData);
      expect(result.metadata.forced_storage).toBe(true);
      expect(result.size).toBeGreaterThan(100 * 1024);
    });

    it('should handle save errors gracefully', async () => {
      const mockSaveJson = jest.spyOn(storageSafe, 'saveJson')
        .mockRejectedValue(new Error('S3 save failed'));

      const testData = { test: 'data' };

      await expect(safeStepOutput('error-key', testData))
        .rejects
        .toThrow('S3 save failed');
    });
  });

  describe('wouldExceedStepLimit', () => {
    it('should return false for small data', () => {
      const smallData = { foo: 'bar' };
      expect(wouldExceedStepLimit(smallData)).toBe(false);
    });

    it('should return true for large data', () => {
      // Create data > 100KB
      const largeData = { data: 'x'.repeat(150000) };
      expect(wouldExceedStepLimit(largeData)).toBe(true);
    });

    it('should handle circular references gracefully', () => {
      const circular: any = { a: 1 };
      circular.self = circular;

      // Should return true since it can't serialize
      expect(wouldExceedStepLimit(circular)).toBe(true);
    });

    it('should handle null and undefined', () => {
      expect(wouldExceedStepLimit(null)).toBe(false);
      expect(wouldExceedStepLimit(undefined)).toBe(false);
    });
  });

  describe('minimalStepResult', () => {
    it('should create minimal result with episode_id and keys', () => {
      const result = minimalStepResult(
        'EP123',
        { transcript: 's3://bucket/transcript.json' },
        { segments: 100, duration: 3600 }
      );

      expect(result).toEqual({
        episode_id: 'EP123',
        keys: { transcript: 's3://bucket/transcript.json' },
        stats: { segments: 100, duration: 3600 },
      });
    });

    it('should work with empty stats', () => {
      const result = minimalStepResult('EP456', { audio: 's3://bucket/audio.mp3' });

      expect(result).toEqual({
        episode_id: 'EP456',
        keys: { audio: 's3://bucket/audio.mp3' },
        stats: {},
      });
    });

    it('should handle multiple storage keys', () => {
      const result = minimalStepResult(
        'EP789',
        {
          diarization: 's3://bucket/diarization.json',
          speakerMap: 's3://bucket/speakers.json',
          enriched: 's3://bucket/enriched.json',
        },
        { identified: 5, total: 10 }
      );

      expect(result.keys).toHaveProperty('diarization');
      expect(result.keys).toHaveProperty('speakerMap');
      expect(result.keys).toHaveProperty('enriched');
      expect(result.stats).toEqual({ identified: 5, total: 10 });
    });
  });
});