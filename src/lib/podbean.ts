import axios, { AxiosInstance, AxiosError } from "axios";

// Podbean API types
interface PodcastEpisode {
  id: string;
  title: string;
  content: string;
  publish_time: number;
  duration: number;
  media_url: string;
  player_url?: string;
  permalink_url?: string;
  [key: string]: any; // Keep other fields for future use
}

interface EpisodeListResponse {
  episodes: PodcastEpisode[];
  has_more?: boolean;
  offset?: number;
  limit?: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export class PodbeanClient {
  private client: AxiosInstance;
  private accessToken: string;
  private refreshToken: string;
  private tokenExpiresAt: number = 0;
  private authFailureCount: number = 0;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.PODBEAN_API_BASE || "https://api.podbean.com",
      timeout: 30000,
    });

    // Initialize with env tokens if available
    this.accessToken = process.env.PODBEAN_ACCESS_TOKEN || "";
    this.refreshToken = process.env.PODBEAN_REFRESH_TOKEN || "";

    // Set up request interceptor for auth
    this.client.interceptors.request.use(async (config) => {
      const token = await this.getValidAccessToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  private async getValidAccessToken(): Promise<string> {
    // If we have a token and it's not expired, use it
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    // If we have a static access token from env, use it
    if (this.accessToken) {
      console.log("Using static access token from environment");
      return this.accessToken;
    }

    // Try to refresh the token if we have a refresh token
    if (this.refreshToken) {
      try {
        await this.refreshAccessToken();
        return this.accessToken;
      } catch (error) {
        console.error("Failed to refresh token:", error);
        throw new Error("Authentication failed - token refresh failed");
      }
    }

    // Try client credentials flow if we have client ID and secret
    if (process.env.PODBEAN_CLIENT_ID && process.env.PODBEAN_CLIENT_SECRET) {
      try {
        await this.getClientCredentialsToken();
        return this.accessToken;
      } catch (error) {
        console.error("Failed to get client credentials token:", error);
        throw new Error("Authentication failed - client credentials failed");
      }
    }

    // No valid token available
    throw new Error("No valid authentication token available");
  }

  /**
   * Get access token using client credentials flow
   */
  private async getClientCredentialsToken(): Promise<void> {
    const params = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.PODBEAN_CLIENT_ID || "",
      client_secret: process.env.PODBEAN_CLIENT_SECRET || "",
    });

    try {
      const response = await axios.post<TokenResponse>(
        `${process.env.PODBEAN_API_BASE || "https://api.podbean.com"}/v1/oauth/token`,
        params,
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      );

      this.accessToken = response.data.access_token;
      // Client credentials tokens typically don't have refresh tokens
      // Set expiry with 5 minute buffer
      this.tokenExpiresAt = Date.now() + (response.data.expires_in - 300) * 1000;

      console.log("Client credentials token obtained successfully");
    } catch (error) {
      console.error("Client credentials token request failed:", error);
      throw error;
    }
  }

  /**
   * Refresh the access token using refresh token
   */
  private async refreshAccessToken(): Promise<void> {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.refreshToken,
      client_id: process.env.PODBEAN_CLIENT_ID || "",
      client_secret: process.env.PODBEAN_CLIENT_SECRET || "",
    });

    try {
      const response = await axios.post<TokenResponse>(
        `${process.env.PODBEAN_API_BASE || "https://api.podbean.com"}/v1/oauth/token`,
        params,
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      );

      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token;
      // Set expiry with 5 minute buffer
      this.tokenExpiresAt = Date.now() + (response.data.expires_in - 300) * 1000;

      console.log("Token refreshed successfully");
    } catch (error) {
      console.error("Token refresh failed:", error);
      throw error;
    }
  }

  /**
   * Fetch episode metadata by ID (supports both numeric IDs and GUIDs)
   * @param episodeId Either a numeric Podbean episode ID or a GUID from RSS feed
   */
  async getEpisode(episodeId: string): Promise<PodcastEpisode> {
    console.log(`Getting episode: ${episodeId}`);

    // Detect if this is a GUID (UUID format) or numeric ID
    const isGuid = this.isGuidFormat(episodeId);

    if (isGuid) {
      console.log(`Detected GUID format, resolving to numeric ID...`);
      const numericId = await this.resolveGuidToNumericId(episodeId);
      if (!numericId) {
        throw new Error(`Episode not found for GUID: ${episodeId}`);
      }
      console.log(`Resolved GUID ${episodeId} to numeric ID: ${numericId}`);
      return this.fetchEpisodeByNumericId(numericId);
    } else {
      console.log(`Using numeric ID directly: ${episodeId}`);
      return this.fetchEpisodeByNumericId(episodeId);
    }
  }

  /**
   * Check if the ID looks like a GUID/UUID format
   */
  private isGuidFormat(id: string): boolean {
    // UUID format: 8-4-4-4-12 characters (36 total with dashes)
    const guidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    return guidPattern.test(id);
  }

  /**
   * Resolve a GUID to numeric episode ID by searching episode list
   */
  private async resolveGuidToNumericId(guid: string): Promise<string | null> {
    try {
      console.log(`Searching for GUID ${guid} in episode list...`);

      // Get recent episodes (we'll search in batches if needed)
      let offset = 0;
      const limit = 100; // Reasonable batch size
      let hasMore = true;

      while (hasMore) {
        const episodes = await this.getEpisodeList(offset, limit);

        // Look for matching GUID in this batch
        for (const episode of episodes.episodes) {
          // Check direct GUID field (if available)
          if (episode.guid === guid) {
            console.log(`Found matching episode: ${episode.id} for GUID ${guid}`);
            return episode.id;
          }

          // Extract GUID from media_url if direct GUID field not available
          // Pattern: rss_p_episodes_captivate_fm_episode_<GUID>.mp3
          if (episode.media_url) {
            const mediaUrlGuidMatch = episode.media_url.match(/rss_p_episodes_captivate_fm_episode_([a-f0-9-]+)\.mp3/i);
            if (mediaUrlGuidMatch && mediaUrlGuidMatch[1] === guid) {
              console.log(`Found matching episode via media_url: ${episode.id} for GUID ${guid}`);
              return episode.id;
            }
          }
        }

        // Check if there are more episodes to search
        hasMore = episodes.has_more === true;
        offset += limit;

        // Safety limit: don't search more than 1000 episodes
        if (offset >= 1000) {
          console.warn(`Stopped searching after 1000 episodes for GUID ${guid}`);
          break;
        }
      }

      console.log(`GUID ${guid} not found in episode list`);
      return null;
    } catch (error) {
      console.error(`Error resolving GUID ${guid}:`, error);
      throw error;
    }
  }

  /**
   * Fetch episode list with pagination support
   */
  private async getEpisodeList(offset: number = 0, limit: number = 100): Promise<EpisodeListResponse> {
    try {
      console.log(`Fetching episode list (offset: ${offset}, limit: ${limit})`);
      const response = await this.client.get<EpisodeListResponse>(
        `/v1/episodes?offset=${offset}&limit=${limit}`
      );

      // Debug: Log the structure of the first episode to understand the response format
      if (response.data.episodes && response.data.episodes.length > 0) {
        console.log(`Fetched ${response.data.episodes.length} episodes`);
        console.log(`First episode structure:`, JSON.stringify(response.data.episodes[0], null, 2));
      } else {
        console.log(`No episodes found in response`);
      }

      return response.data;
    } catch (error) {
      console.error(`Failed to get episode list (offset: ${offset}, limit: ${limit}):`, error);
      throw error;
    }
  }

  /**
   * Fetch episode metadata by numeric ID
   */
  private async fetchEpisodeByNumericId(episodeId: string): Promise<PodcastEpisode> {
    try {
      const response = await this.client.get<{ episode: PodcastEpisode }>(
        `/v1/episodes/${episodeId}`
      );
      // Reset auth failure counter on successful request
      this.authFailureCount = 0;
      return response.data.episode;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;

        if (axiosError.response?.status === 401) {
          this.authFailureCount++;

          // Max 3 attempts to prevent hot-looping
          if (this.authFailureCount > 3) {
            throw new Error("Authentication failed after 3 attempts - check your credentials");
          }

          // Exponential backoff: 1s, 2s, 4s
          const backoffMs = Math.pow(2, this.authFailureCount - 1) * 1000;
          console.log(`Got 401 (attempt ${this.authFailureCount}), waiting ${backoffMs}ms before retry`);

          await new Promise(resolve => setTimeout(resolve, backoffMs));

          try {
            await this.refreshAccessToken();
          } catch (refreshError) {
            console.error("Token refresh failed:", refreshError);
            throw new Error("Authentication failed - unable to refresh token");
          }

          // Retry the request
          const response = await this.client.get<{ episode: PodcastEpisode }>(
            `/v1/episodes/${episodeId}`
          );
          // Reset auth failure counter on successful retry
          this.authFailureCount = 0;
          return response.data.episode;
        } else if (axiosError.response?.status === 404) {
          throw new Error(`Episode not found: ${episodeId}`);
        } else if (axiosError.response?.status === 429) {
          throw new Error("Rate limited by Podbean API");
        }
      }

      throw error;
    }
  }

  /**
   * Validate episode ID format
   * Supports both Podbean numeric IDs and RSS GUIDs
   */
  static validateEpisodeId(episodeId: string): boolean {
    if (!episodeId || episodeId.length === 0) {
      return false;
    }

    // Check if it's a GUID format
    const guidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (guidPattern.test(episodeId)) {
      return true;
    }

    // Check if it's a Podbean numeric ID format
    const numericPattern = /^[a-zA-Z0-9_-]+$/;
    return numericPattern.test(episodeId) && episodeId.length < 100;
  }
}

// Export singleton instance for convenience
export const podbeanClient = new PodbeanClient();