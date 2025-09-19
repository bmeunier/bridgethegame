import axios, { AxiosInstance, AxiosError } from "axios";

// Podbean API types
interface PodcastEpisode {
  id: string;
  title: string;
  content: string;
  publish_time: number;
  duration: number;
  audio_url: string;
  [key: string]: any; // Keep other fields for future use
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
   * Fetch episode metadata by ID
   */
  async getEpisode(episodeId: string): Promise<PodcastEpisode> {
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
   * Podbean episode IDs are typically alphanumeric strings
   */
  static validateEpisodeId(episodeId: string): boolean {
    // Basic validation: alphanumeric with possible hyphens/underscores
    const pattern = /^[a-zA-Z0-9_-]+$/;
    return pattern.test(episodeId) && episodeId.length > 0 && episodeId.length < 100;
  }
}

// Export singleton instance for convenience
export const podbeanClient = new PodbeanClient();