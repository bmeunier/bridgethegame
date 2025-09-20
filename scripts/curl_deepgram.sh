#!/bin/bash
# Example cURL command for testing Deepgram API directly
# Usage: ./scripts/curl_deepgram.sh <audio_url>

# Load .env file
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Check for API key
if [ -z "$DEEPGRAM_API_KEY" ]; then
  echo "Error: DEEPGRAM_API_KEY not set in .env"
  exit 1
fi

# Check for audio URL argument
if [ -z "$1" ]; then
  echo "Usage: ./scripts/curl_deepgram.sh <audio_url>"
  echo "Example: ./scripts/curl_deepgram.sh https://example.com/audio.mp3"
  exit 1
fi

AUDIO_URL=$1

echo "Testing Deepgram API with audio URL: $AUDIO_URL"
echo "---"

# Call Deepgram API
curl -X POST "https://api.deepgram.com/v1/listen?punctuate=true&utterances=true&paragraphs=true&timestamps=true&diarize=false&language=en&smart_format=true" \
  -H "Authorization: Token $DEEPGRAM_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"$AUDIO_URL\"}" \
  | python3 -m json.tool

echo "---"
echo "Test complete!"