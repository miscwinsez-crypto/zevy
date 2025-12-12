#!/bin/bash

# Test script to verify model connectivity
echo "Testing Gemini model connectivity..."

# Test Gemini API
if [ -z "$GOOGLE_API_KEY" ]; then
    echo "Error: GOOGLE_API_KEY environment variable not set"
    exit 1
fi

# Simple curl request to test if the API key is valid
curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-goog-api-key: $GOOGLE_API_KEY" \
  -d '{
    "contents": [{
      "parts": [{
        "text": "Hello, world!"
      }]
    }]
  }' \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent" \
  -w "\nResponse Code: %{http_code}\n" \
  -s -o /dev/null

echo "Test completed."