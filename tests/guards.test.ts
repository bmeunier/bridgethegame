/**
 * Unit tests for guard utilities
 */

import { describe, it, expect } from '@jest/globals';
import {
  ensureObject,
  ensureArray,
  ensureString,
  ensureNumber,
  safeEntries,
  safeKeys,
  safeValues,
  isDefined,
  isNonEmptyString,
  isNonEmptyArray,
} from '../src/lib/guards';

describe('Guard Utilities', () => {
  describe('ensureObject', () => {
    it('should return object when valid', () => {
      const obj = { foo: 'bar' };
      expect(ensureObject(obj, 'test')).toBe(obj);
    });

    it('should throw on null', () => {
      expect(() => ensureObject(null, 'test')).toThrow('Expected object for test, got null/undefined');
    });

    it('should throw on undefined', () => {
      expect(() => ensureObject(undefined, 'test')).toThrow('Expected object for test, got null/undefined');
    });

    it('should throw on non-object', () => {
      expect(() => ensureObject('string', 'test')).toThrow('Expected object for test, got string');
      expect(() => ensureObject(123, 'test')).toThrow('Expected object for test, got number');
    });
  });

  describe('ensureArray', () => {
    it('should return array when valid', () => {
      const arr = [1, 2, 3];
      expect(ensureArray(arr, 'test')).toBe(arr);
    });

    it('should throw on null', () => {
      expect(() => ensureArray(null, 'test')).toThrow('Expected array for test, got null/undefined');
    });

    it('should throw on undefined', () => {
      expect(() => ensureArray(undefined, 'test')).toThrow('Expected array for test, got null/undefined');
    });

    it('should throw on non-array', () => {
      expect(() => ensureArray({ foo: 'bar' }, 'test')).toThrow('Expected array for test, got object');
      expect(() => ensureArray('string', 'test')).toThrow('Expected array for test, got string');
    });
  });

  describe('ensureString', () => {
    it('should return string when valid', () => {
      expect(ensureString('test', 'field')).toBe('test');
      expect(ensureString('', 'field')).toBe('');
    });

    it('should throw on null', () => {
      expect(() => ensureString(null, 'test')).toThrow('Expected string for test, got null/undefined');
    });

    it('should throw on non-string', () => {
      expect(() => ensureString(123, 'test')).toThrow('Expected string for test, got number');
      expect(() => ensureString({}, 'test')).toThrow('Expected string for test, got object');
    });
  });

  describe('ensureNumber', () => {
    it('should return number when valid', () => {
      expect(ensureNumber(123, 'field')).toBe(123);
      expect(ensureNumber(0, 'field')).toBe(0);
      expect(ensureNumber(-123.45, 'field')).toBe(-123.45);
    });

    it('should throw on NaN', () => {
      expect(() => ensureNumber(NaN, 'test')).toThrow('Expected number for test, got number');
    });

    it('should throw on non-number', () => {
      expect(() => ensureNumber('123', 'test')).toThrow('Expected number for test, got string');
      expect(() => ensureNumber(null, 'test')).toThrow('Expected number for test, got null/undefined');
    });
  });

  describe('safeEntries', () => {
    it('should return entries for valid object', () => {
      const obj = { a: 1, b: 2 };
      expect(safeEntries(obj)).toEqual([['a', 1], ['b', 2]]);
    });

    it('should return empty array for null', () => {
      expect(safeEntries(null)).toEqual([]);
    });

    it('should return empty array for undefined', () => {
      expect(safeEntries(undefined)).toEqual([]);
    });

    it('should work with empty object', () => {
      expect(safeEntries({})).toEqual([]);
    });
  });

  describe('safeKeys', () => {
    it('should return keys for valid object', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(safeKeys(obj)).toEqual(['a', 'b', 'c']);
    });

    it('should return empty array for null', () => {
      expect(safeKeys(null)).toEqual([]);
    });

    it('should return empty array for undefined', () => {
      expect(safeKeys(undefined)).toEqual([]);
    });
  });

  describe('safeValues', () => {
    it('should return values for valid object', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(safeValues(obj)).toEqual([1, 2, 3]);
    });

    it('should return empty array for null', () => {
      expect(safeValues(null)).toEqual([]);
    });

    it('should return empty array for undefined', () => {
      expect(safeValues(undefined)).toEqual([]);
    });
  });

  describe('isDefined', () => {
    it('should return true for defined values', () => {
      expect(isDefined(0)).toBe(true);
      expect(isDefined('')).toBe(true);
      expect(isDefined(false)).toBe(true);
      expect(isDefined({})).toBe(true);
      expect(isDefined([])).toBe(true);
    });

    it('should return false for null and undefined', () => {
      expect(isDefined(null)).toBe(false);
      expect(isDefined(undefined)).toBe(false);
    });
  });

  describe('isNonEmptyString', () => {
    it('should return true for non-empty strings', () => {
      expect(isNonEmptyString('test')).toBe(true);
      expect(isNonEmptyString(' ')).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isNonEmptyString('')).toBe(false);
    });

    it('should return false for non-strings', () => {
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
      expect(isNonEmptyString(123)).toBe(false);
      expect(isNonEmptyString({})).toBe(false);
    });
  });

  describe('isNonEmptyArray', () => {
    it('should return true for non-empty arrays', () => {
      expect(isNonEmptyArray([1, 2, 3])).toBe(true);
      expect(isNonEmptyArray(['test'])).toBe(true);
    });

    it('should return false for empty array', () => {
      expect(isNonEmptyArray([])).toBe(false);
    });

    it('should return false for non-arrays', () => {
      expect(isNonEmptyArray(null)).toBe(false);
      expect(isNonEmptyArray(undefined)).toBe(false);
      expect(isNonEmptyArray('string')).toBe(false);
      expect(isNonEmptyArray({})).toBe(false);
    });
  });
});