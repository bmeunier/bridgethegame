# Podbean API Retrieval – Permanent Safeguard

This file describes improvements and guardrails to ensure we never lose or overwrite the Podbean episode ID fix again.

---

## Context

- Podbean's API expects **short alphanumeric IDs** (e.g. `WRQZ7196C943`).  
- RSS `<guid>` values (UUID-like, e.g. `d891a427-17ae-438a-882b-da16ddff0212`) **are not valid** IDs for the Podbean API.  
- Accidentally passing GUIDs into `PodbeanClient.getEpisode` caused repeated failures (`Episode not found`).  

---

## Improvements

### 1. Single Utility: `getEpisodeByIdOrFail`

All Podbean lookups should go through one function that enforces correct ID usage.

```ts
// src/lib/podbean.ts

import fetch from "node-fetch";

export class PodbeanClient {
  constructor(private token: string) {}

  async getEpisodeByIdOrFail(id: string): Promise<any> {
    // Podbean episode IDs are alphanumeric, ~8–16 chars
    const isApiId = /^[A-Za-z0-9]{8,16}$/.test(id);
    if (!isApiId) {
      throw new Error(
        \`Invalid Podbean ID: \${id}. Did you accidentally use an RSS GUID instead of an episode_id?\`
      );
    }

    const resp = await fetch(\`https://api.podbean.com/v1/episodes/\${id}\`, {
      headers: { Authorization: \`Bearer \${this.token}\` },
    });

    if (!resp.ok) {
      throw new Error(\`Podbean API error \${resp.status}: \${resp.statusText}\`);
    }

    return resp.json();
  }
}
```

This guarantees misuse fails loud instead of silently.

---

### 2. Tests: `podbean_retrieval.test.ts`

```ts
import { describe, it, expect, vi } from "vitest";
import { PodbeanClient } from "@/lib/podbean";

describe("PodbeanClient.getEpisodeByIdOrFail", () => {
  const client = new PodbeanClient("FAKE_TOKEN");

  it("rejects RSS GUIDs", async () => {
    await expect(
      client.getEpisodeByIdOrFail("d891a427-17ae-438a-882b-da16ddff0212")
    ).rejects.toThrow(/Invalid Podbean ID/);
  });

  it("accepts Podbean short IDs", async () => {
    // @ts-ignore
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "WRQZ7196C943", title: "Episode title" }),
    });

    const result = await client.getEpisodeByIdOrFail("WRQZ7196C943");
    expect(result.id).toBe("WRQZ7196C943");
  });
});
```

---

### 3. Documentation: API Contract

Create a doc file `docs/DEVLOG/podbean_api_contract.md` with:

```
# Podbean API Contract

- Valid episode IDs: short alphanumeric (8–16 chars).  
- Invalid: RSS GUIDs, form IDs, dashboard UUIDs.  
- Always call `getEpisodeByIdOrFail()` for episode retrieval.  
- Never rely on RSS `<guid>` in code paths.
```

---

## Benefits

- **Code:** Centralized enforcement of correct Podbean IDs.  
- **Tests:** Prevent regression; CI fails if someone reverts.  
- **Docs:** Institutional memory; new contributors see the rules.  

---

## Next Step

- Park this file until diarization stabilizes.  
- Once diarization is fixed, implement these improvements to make the Podbean fix permanent.
