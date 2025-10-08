# PodbeanClient.getEpisode Fix

This file includes a sample TypeScript implementation and the full Critic Forge prompt you can give to Claude Code.

---

## Sample Implementation (TypeScript)

```ts
// src/lib/podbean.ts

import fetch from "node-fetch";

export class PodbeanClient {
  private token: string;
  private baseUrl: string;

  constructor(token: string) {
    this.token = token;
    this.baseUrl = "https://api.podbean.com/v1";
  }

  /**
   * Get an episode by either Podbean's episode_id or by RSS GUID
   */
  async getEpisode(id: string): Promise<any> {
    // Heuristic: RSS GUIDs are UUID-like (contain dashes, 36 chars)
    const isGuid = /^[0-9a-fA-F-]{36}$/.test(id);

    if (!isGuid) {
      // Assume it's a Podbean episode_id
      return this.fetchEpisodeById(id);
    }

    // Otherwise resolve GUID → episode_id
    const episodeId = await this.resolveGuidToEpisodeId(id);
    if (!episodeId) {
      throw new Error(`Episode not found for GUID: ${id}`);
    }

    return this.fetchEpisodeById(episodeId);
  }

  private async fetchEpisodeById(episodeId: string): Promise<any> {
    const resp = await fetch(`${this.baseUrl}/episodes/${episodeId}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!resp.ok) {
      throw new Error(`Failed to fetch episode: ${resp.statusText}`);
    }
    return resp.json();
  }

  private async resolveGuidToEpisodeId(guid: string): Promise<string | null> {
    // Note: may need pagination if your feed is large
    const resp = await fetch(`${this.baseUrl}/episodes`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!resp.ok) {
      throw new Error(`Failed to list episodes: ${resp.statusText}`);
    }
    const data = await resp.json();
    const match = data.episodes.find((ep: any) => ep.guid === guid);
    return match ? match.episode_id : null;
  }
}
```

---

## Prompt for Claude Code

Review the following issue in my code and propose a fix:

**Context:**

- My XML feed for _The Game_ contains `<guid>` values like:
  ```
  d891a427-17ae-438a-882b-da16ddff0212
  ```
- When I pass this GUID into `PodbeanClient.getEpisode`, I get:
  ```
  Error: Episode not found: d891a427-17ae-438a-882b-da16ddff0212
  ```
- This suggests that the Podbean API does **not** recognize the RSS `<guid>` as a valid identifier.
- Instead, the Podbean API expects its **own episode_id** (shorter string, e.g. `eb5q57pvxpm`), which can be retrieved by calling `GET https://api.podbean.com/v1/episodes` with my access token.

**Task:**
Update `PodbeanClient.getEpisode` so it works reliably:

1. Detect if the provided ID looks like a UUID (RSS GUID) vs. a Podbean API ID.
2. If it’s a GUID (UUID-like string), resolve it first by fetching all recent episodes from `/v1/episodes` and matching against `guid`.
3. Once the correct `episode_id` is found, call the API again to retrieve the full episode details.
4. Return consistent episode data so my Inngest function doesn’t break.
5. Add clear error handling if no match is found.

**Deliverable:**

- Suggest a concrete implementation (in Node/TypeScript) for the `getEpisode` function.
- Make it efficient (don’t always fetch _all_ episodes if avoidable).
- Keep the public `getEpisode(id)` interface unchanged.
