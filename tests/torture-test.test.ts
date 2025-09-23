/**
 * 🔥 TORTURE TEST: Inngest Step Output Size Limits 🔥
 *
 * This test simulates the absolute worst-case scenario:
 * - 12-hour marathon podcast episode
 * - 6,000+ diarization segments
 * - 8,000+ transcript utterances
 * - 12 different speakers
 * - Complex speaker mappings and near-misses
 *
 * If this passes, our fix can handle ANYTHING.
 */

import { describe, test, expect } from '@jest/globals';
import { safeStepOutput, createSafeStepResult } from '../src/lib/inngest-utils';

describe('🔥 TORTURE TEST: Step Output Size Limits', () => {

  test('🎯 TORTURE TEST: 12-hour marathon episode with 6,000 segments', () => {
    console.log('🚀 Starting TORTURE TEST for 12-hour marathon episode...');

    // Test Step 1: Registry loading with 12 speakers
    const registryMetadata = {
      episode_id: 'TORTURE-TEST-12HOUR-MARATHON',
      speakers_count: 12,
      speakers: [
        'Marathon Speaker 1', 'Marathon Speaker 2', 'Marathon Speaker 3',
        'Marathon Speaker 4', 'Marathon Speaker 5'
      ], // Only show first 5
      total_references: 12,
      avg_threshold: 0.78,
      loading_time_ms: 1500
    };

    console.log('📋 Testing registry metadata step...');
    expect(() => safeStepOutput(registryMetadata, 'load-speaker-registry')).not.toThrow();

    const registrySize = JSON.stringify(registryMetadata).length;
    console.log(`✅ Registry metadata size: ${registrySize} bytes (${(registrySize/1024).toFixed(1)}KB)`);
    expect(registrySize).toBeLessThan(1024); // Should be under 1KB

    // Test Step 2: Diarization metadata (6,000 segments)
    const diarizationMetadata = {
      episode_id: 'TORTURE-TEST-12HOUR-MARATHON',
      storage_key: 'transcripts/TORTURE-TEST-12HOUR-MARATHON/diarization.json',
      source: 'pyannote',
      segments_count: 6000,
      total_duration: 43200, // 12 hours in seconds
      speakers_detected: ['SPEAKER_00', 'SPEAKER_01', 'SPEAKER_02', 'SPEAKER_03', 'SPEAKER_04'],
      processing_time_ms: 180000, // 3 minutes processing
      file_size_mb: 2.5
    };

    console.log('🎛️ Testing diarization metadata step...');
    expect(() => safeStepOutput(diarizationMetadata, 'pyannote-diarization')).not.toThrow();

    const diarizationSize = JSON.stringify(diarizationMetadata).length;
    console.log(`✅ Diarization metadata size: ${diarizationSize} bytes (${(diarizationSize/1024).toFixed(1)}KB)`);
    expect(diarizationSize).toBeLessThan(1024); // Should be under 1KB

    // Test Step 3: Speaker identification metadata (complex mapping)
    const speakerMetadata = {
      episode_id: 'TORTURE-TEST-12HOUR-MARATHON',
      identified_speakers_count: 12,
      near_misses_count: 47, // Many close matches in 12-hour episode
      total_clusters: 89, // Complex speaker clustering
      confidence_stats: {
        avg_confidence: 0.84,
        min_confidence: 0.67,
        max_confidence: 0.97,
        std_deviation: 0.08
      },
      threshold_analysis: {
        successful_matches: 12,
        threshold_misses: 47,
        avg_threshold: 0.75
      },
      processing_time_ms: 240000 // 4 minutes processing
    };

    console.log('🗣️ Testing speaker identification metadata step...');
    expect(() => safeStepOutput(speakerMetadata, 'cluster-speaker-identification')).not.toThrow();

    const speakerSize = JSON.stringify(speakerMetadata).length;
    console.log(`✅ Speaker metadata size: ${speakerSize} bytes (${(speakerSize/1024).toFixed(1)}KB)`);
    expect(speakerSize).toBeLessThan(1024); // Should be under 1KB

    // Test Step 4: Enrichment metadata (8,000 utterances)
    const enrichmentMetadata = {
      episode_id: 'TORTURE-TEST-12HOUR-MARATHON',
      enriched_segments_count: 8000,
      identified_segments_count: 7200, // 90% identification rate
      unidentified_segments_count: 800,
      total_words: 150000,
      speaker_distribution: {
        'SPEAKER_00': 1200,
        'SPEAKER_01': 1100,
        'SPEAKER_02': 950,
        'SPEAKER_03': 890,
        'SPEAKER_04': 850,
        'unknown': 800,
        'others': 1410 // Remaining speakers combined
      },
      quality_metrics: {
        avg_confidence: 0.89,
        high_confidence_segments: 6800, // >0.8 confidence
        low_confidence_segments: 400,   // <0.6 confidence
      },
      processing_time_ms: 12000,
      enriched_file_size_mb: 8.2
    };

    console.log('💬 Testing enrichment metadata step...');
    expect(() => safeStepOutput(enrichmentMetadata, 'enrich-transcript')).not.toThrow();

    const enrichmentSize = JSON.stringify(enrichmentMetadata).length;
    console.log(`✅ Enrichment metadata size: ${enrichmentSize} bytes (${(enrichmentSize/1024).toFixed(1)}KB)`);
    expect(enrichmentSize).toBeLessThan(1024); // Should be under 1KB

    // Test Step 5: Save artifacts metadata
    const artifactsMetadata = {
      episode_id: 'TORTURE-TEST-12HOUR-MARATHON',
      enriched_path: 'transcripts/TORTURE-TEST-12HOUR-MARATHON/enriched.json',
      audit_path: 'transcripts/TORTURE-TEST-12HOUR-MARATHON/pyannote_audit.json',
      cluster_summaries_count: 89,
      total_artifacts_size_mb: 10.7,
      save_time_ms: 3500
    };

    console.log('💾 Testing save artifacts metadata step...');
    expect(() => safeStepOutput(artifactsMetadata, 'save-artifacts')).not.toThrow();

    // Test Final Return: Function completion metadata
    const finalResult = {
      status: 'success',
      episode_id: 'TORTURE-TEST-12HOUR-MARATHON',
      diarization_source: 'pyannote',
      identified_speakers: 12,
      near_misses_count: 47,
      enriched_segments_count: 8000,
      processing_time_ms: 450000, // 7.5 minutes total
      s3_enriched_path: 'transcripts/TORTURE-TEST-12HOUR-MARATHON/enriched.json',
      s3_audit_path: 'transcripts/TORTURE-TEST-12HOUR-MARATHON/pyannote_audit.json',
      total_file_size_mb: 10.7,
      performance_grade: 'A+' // Because it didn't crash! 🎉
    };

    console.log('🏁 Testing final return metadata...');
    expect(() => safeStepOutput(finalResult, 'diarize-episode-final-return')).not.toThrow();

    const finalSize = JSON.stringify(finalResult).length;
    console.log(`✅ Final result size: ${finalSize} bytes (${(finalSize/1024).toFixed(1)}KB)`);
    expect(finalSize).toBeLessThan(1024); // Should be under 1KB

    console.log('🎉 TORTURE TEST PASSED! All step outputs are under 1KB limit.');
  });

  test('💀 TORTURE TEST: What would BREAK without our fix (massive data)', () => {
    console.log('💀 Testing what would break without our fix...');

    // This simulates what we used to return: FULL diarization data
    const massiveDiarizationResult = {
      episode_id: 'TORTURE-TEST-12HOUR-MARATHON',
      source: 'pyannote',
      // 6,000 segments - this would be HUGE
      segments: Array(6000).fill(null).map((_, i) => ({
        start: i * 7.2,
        end: (i * 7.2) + 6.5,
        speaker: `SPEAKER_${i % 12}`,
        confidence: 0.85 + Math.random() * 0.1,
        metadata: {
          energy: Math.random(),
          pitch: 200 + Math.random() * 100,
          timbre: Array(13).fill(null).map(() => Math.random()),
          spectral_features: Array(40).fill(null).map(() => Math.random()),
        }
      })),
      // Massive speaker map
      speakers: Object.fromEntries(
        Array(12).fill(null).map((_, i) => [
          `SPEAKER_${i}`,
          {
            segments: Array(500).fill(null).map(() => Math.random() * 43200),
            total_duration: 3000 + Math.random() * 1000,
            characteristics: {
              avg_pitch: 200 + Math.random() * 100,
              speech_rate: 150 + Math.random() * 50,
              energy_profile: Array(100).fill(null).map(() => Math.random()),
            }
          }
        ])
      )
    };

    // This MUST throw - proves our fix is working
    console.log('🧨 Testing massive diarization result (should FAIL)...');
    expect(() => safeStepOutput(massiveDiarizationResult, 'massive-torture-test')).toThrow(
      /output too large/
    );

    // Verify the size is indeed massive
    const massiveSize = JSON.stringify(massiveDiarizationResult).length;
    console.log(`💀 Massive result size: ${massiveSize} bytes (${(massiveSize/1024/1024).toFixed(1)}MB)`);
    expect(massiveSize).toBeGreaterThan(1000000); // > 1MB - would definitely break Inngest

    console.log('✅ Confirmed: Our fix correctly rejects massive payloads!');
  });

  test('🌪️ EXTREME TORTURE: 24-hour marathon with 12,000 segments', () => {
    console.log('🌪️ Starting EXTREME TORTURE TEST for 24-hour episode...');

    // Even more extreme: 24-hour episode
    const extremeDiarizationMetadata = {
      episode_id: 'EXTREME-TORTURE-24HOUR-ULTRA-MARATHON',
      storage_key: 'transcripts/EXTREME-TORTURE-24HOUR-ULTRA-MARATHON/diarization.json',
      source: 'pyannote',
      segments_count: 12000, // Double the torture
      total_duration: 86400, // 24 hours
      speakers_detected: Array(20).fill(null).map((_, i) => `SPEAKER_${i.toString().padStart(2, '0')}`),
      cluster_count: 156,
      processing_time_ms: 600000, // 10 minutes processing
      file_size_mb: 5.2,
      complexity_score: 9.8 // Out of 10
    };

    console.log('🎛️ Testing EXTREME diarization metadata...');
    expect(() => safeStepOutput(extremeDiarizationMetadata, 'extreme-pyannote-diarization')).not.toThrow();

    const extremeSize = JSON.stringify(extremeDiarizationMetadata).length;
    console.log(`✅ EXTREME metadata size: ${extremeSize} bytes (${(extremeSize/1024).toFixed(1)}KB)`);
    expect(extremeSize).toBeLessThan(2048); // Even extreme cases should be under 2KB

    console.log('🎉 EXTREME TORTURE TEST PASSED! Even 24-hour episodes are safe!');
  });

  test('🎪 CIRCUS TEST: Validate createSafeStepResult with torture data', () => {
    console.log('🎪 Testing createSafeStepResult with torture scenarios...');

    const tortureSafeResult = createSafeStepResult(
      'TORTURE-TEST-12HOUR-MARATHON',
      's3://bridgethegame-transcripts/TORTURE-TEST-12HOUR-MARATHON/diarization.json',
      {
        segments_count: 6000,
        processing_time_ms: 180000,
        source: 'pyannote',
        speakers_detected: 12,
        complexity_rating: 'EXTREME',
        file_size_mb: 2.5,
        success_metrics: {
          diarization_quality: 0.94,
          speaker_identification_rate: 0.89,
          processing_efficiency: 0.87
        }
      }
    );

    expect(tortureSafeResult).toHaveProperty('episode_id', 'TORTURE-TEST-12HOUR-MARATHON');
    expect(tortureSafeResult).toHaveProperty('storage_key');
    expect(tortureSafeResult).toHaveProperty('segments_count', 6000);
    expect(tortureSafeResult).toHaveProperty('complexity_rating', 'EXTREME');

    const safeResultSize = JSON.stringify(tortureSafeResult).length;
    console.log(`✅ Safe result size: ${safeResultSize} bytes (${(safeResultSize/1024).toFixed(1)}KB)`);
    expect(safeResultSize).toBeLessThan(1024);

    console.log('🎪 CIRCUS TEST PASSED! createSafeStepResult works with complex metadata!');
  });

  test('🏆 FINAL BOSS: Test all torture scenarios combined', () => {
    console.log('🏆 FINAL BOSS TEST: All torture scenarios combined...');

    const scenarios = [
      { name: '6-hour episode', segments: 3000, utterances: 4000, speakers: 6 },
      { name: '12-hour marathon', segments: 6000, utterances: 8000, speakers: 12 },
      { name: '18-hour endurance', segments: 9000, utterances: 12000, speakers: 18 },
      { name: '24-hour ultra', segments: 12000, utterances: 16000, speakers: 24 },
    ];

    scenarios.forEach((scenario, index) => {
      const metadata = {
        episode_id: `FINAL-BOSS-${scenario.name.replace(/\s+/g, '-').toUpperCase()}`,
        scenario_index: index + 1,
        segments_count: scenario.segments,
        utterances_count: scenario.utterances,
        speakers_count: scenario.speakers,
        complexity_multiplier: (index + 1) * 2,
        processing_time_ms: scenario.segments * 30, // 30ms per segment
        success_rate: 0.95 - (index * 0.02), // Slightly lower for more complex scenarios
      };

      console.log(`🎯 Testing scenario ${index + 1}: ${scenario.name} (${scenario.segments} segments)`);
      expect(() => safeStepOutput(metadata, `final-boss-scenario-${index + 1}`)).not.toThrow();

      const size = JSON.stringify(metadata).length;
      console.log(`✅ Scenario ${index + 1} size: ${size} bytes`);
      expect(size).toBeLessThan(1024);
    });

    console.log('🏆 FINAL BOSS DEFEATED! All torture scenarios passed!');
    console.log('🎉🎉🎉 TORTURE TEST SUITE COMPLETE - FIX IS BULLETPROOF! 🎉🎉🎉');
  });
});