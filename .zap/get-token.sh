#!/bin/bash

# OWASP ZAP Authentication Helper Script
# This script gets JWT token and returns it for ZAP to use

API_URL="https://api.docuflow.id.vn/api"
EMAIL="hocvu2003@gmail.com"
PASSWORD="hocvu"

# Get JWT token
RESPONSE=$(curl -s -k -X POST "${API_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")

# Extract access_token (check nested data object)
ACCESS_TOKEN=$(echo "$RESPONSE" | jq -r '.data.accessToken // .accessToken // .access_token // .data.token // .token // empty')

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
  echo "Error: Failed to get access token" >&2
  echo "Response: $RESPONSE" >&2
  exit 1
fi

# Return token
echo "$ACCESS_TOKEN"
