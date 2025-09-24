#!/usr/bin/env npx tsx

import 'dotenv/config';
import http from 'node:http';
import https from 'node:https';
import { setTimeout as delay } from 'node:timers/promises';
import { triggerEpisode } from './trigger_fresh_pipeline';

interface InngestSendResult {
  ids?: string[];
  [key: string]: unknown;
}

interface InngestRunStatus {
  status?: string;
  error?: {
    message?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

async function fetchJson<T>(url: string): Promise<T> {
  const urlObject = new URL(url);
  const client = urlObject.protocol === 'https:' ? https : http;

  return new Promise<T>((resolve, reject) => {
    const request = client.request(urlObject, (response) => {
      const chunks: Array<string> = [];

      response.setEncoding('utf8');
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const body = chunks.join('');

        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(`Request failed with status ${response.statusCode}: ${body}`));
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Failed to parse JSON from ${url}: ${(error as Error).message}`));
        }
      });
    });

    request.on('error', reject);
    request.end();
  });
}

async function main(): Promise<void> {
  const episodeId = process.argv[2] || 'WRQZ7196C943';
  const pollIntervalMs = Number(process.env.END_TO_END_POLL_INTERVAL_MS ?? 5000);
  const maxPolls = Number(process.env.END_TO_END_MAX_POLLS ?? 60);

  console.log(`🚀 Triggering pipeline for episode: ${episodeId}`);
  const ingestEvent = (await triggerEpisode(episodeId)) as InngestSendResult;

  const runId = ingestEvent.ids?.[0];
  if (!runId) {
    throw new Error('Unable to determine Inngest run ID from trigger response');
  }

  const runUrl = process.env.INNGEST_RUN_STATUS_URL
    ? `${process.env.INNGEST_RUN_STATUS_URL.replace(/\/$/, '')}/${runId}`
    : `http://localhost:8288/api/runs/${runId}`;

  console.log(`📡 Polling Inngest run status at: ${runUrl}`);

  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    let statusResponse: InngestRunStatus;

    try {
      statusResponse = await fetchJson<InngestRunStatus>(runUrl);
    } catch (error) {
      console.error(`⚠️  Failed to fetch run status (attempt ${attempt + 1}/${maxPolls}):`, error);
      await delay(pollIntervalMs);
      continue;
    }

    const status = statusResponse.status ?? 'Unknown';
    console.log(`⏱️ Run status: ${status}`);

    if (status === 'Completed') {
      console.log('✅ Pipeline completed successfully!');
      return;
    }

    if (status === 'Failed') {
      const message = statusResponse.error?.message ?? 'No error message provided';
      console.error(`❌ Pipeline failed: ${message}`);
      process.exit(1);
    }

    await delay(pollIntervalMs);
  }

  console.error('⏰ Timeout waiting for pipeline to finish');
  process.exit(1);
}

main().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('❌ Unexpected error during end-to-end test:', error);
  process.exit(1);
});
