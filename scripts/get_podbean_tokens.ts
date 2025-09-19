import express from "express";
import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000; // Same port as main app (temporarily stop main app)

// Step 1: Authorization URL builder
function buildAuthUrl(clientId: string, redirectUri: string): string {
  const baseUrl = "https://api.podbean.com/v1/dialog/oauth";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code"
  });
  return `${baseUrl}?${params.toString()}`;
}

// Step 2: Exchange code for tokens
async function exchangeCodeForTokens(code: string, clientId: string, clientSecret: string, redirectUri: string) {
  try {
    const response = await axios.post("https://api.podbean.com/v1/oauth/token", {
      grant_type: "authorization_code",
      code: code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    return response.data;
  } catch (error) {
    console.error("Error exchanging code for tokens:", error);
    throw error;
  }
}

// OAuth callback handler
app.get("/callback", async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    res.send(`<h1>Error: ${error}</h1>`);
    return;
  }

  if (!code) {
    res.send("<h1>No authorization code received</h1>");
    return;
  }

  try {
    const clientId = process.env.PODBEAN_CLIENT_ID;
    const clientSecret = process.env.PODBEAN_CLIENT_SECRET;
    const redirectUri = `http://localhost:${PORT}/callback`;

    if (!clientId || !clientSecret) {
      res.send("<h1>Missing PODBEAN_CLIENT_ID or PODBEAN_CLIENT_SECRET in .env</h1>");
      return;
    }

    console.log("Received authorization code:", code);
    console.log("Exchanging for tokens...");

    const tokens = await exchangeCodeForTokens(code as string, clientId, clientSecret, redirectUri);

    console.log("\n🎉 SUCCESS! Your tokens:");
    console.log("PODBEAN_ACCESS_TOKEN=" + tokens.access_token);
    console.log("PODBEAN_REFRESH_TOKEN=" + tokens.refresh_token);
    console.log("Token expires in:", tokens.expires_in, "seconds");

    res.send(`
      <h1>✅ OAuth Success!</h1>
      <p>Check your terminal for the tokens to add to your .env file</p>
      <h3>Add these to your .env file:</h3>
      <pre>
PODBEAN_ACCESS_TOKEN=${tokens.access_token}
PODBEAN_REFRESH_TOKEN=${tokens.refresh_token}
      </pre>
      <p>You can close this window now.</p>
    `);

    // Auto-shutdown after success
    setTimeout(() => {
      console.log("\nShutting down OAuth server...");
      process.exit(0);
    }, 2000);

  } catch (error) {
    console.error("Token exchange failed:", error);
    res.send(`<h1>❌ Token Exchange Failed</h1><pre>${error}</pre>`);
  }
});

// Start the OAuth helper server
app.listen(PORT, () => {
  const clientId = process.env.PODBEAN_CLIENT_ID;
  const redirectUri = `http://localhost:${PORT}/callback`;

  if (!clientId) {
    console.error("❌ Missing PODBEAN_CLIENT_ID in .env file");
    console.log("Please add your Podbean Client ID to .env first");
    process.exit(1);
  }

  const authUrl = buildAuthUrl(clientId, redirectUri);

  console.log(`\n🚀 OAuth Helper Server running on http://localhost:${PORT}`);
  console.log("\n📋 Steps to get your tokens:");
  console.log("1. Open this URL in your browser:");
  console.log(`\n   ${authUrl}\n`);
  console.log("2. Sign in to Podbean and authorize the app");
  console.log("3. You'll be redirected back here with your tokens");
  console.log("4. Copy the tokens to your .env file");
  console.log("\nWaiting for OAuth callback...");
});