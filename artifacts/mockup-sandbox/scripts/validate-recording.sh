#!/bin/bash
set -e
HOOKS_FILE="src/lib/video/hooks.ts"
TEMPLATE_FILE="src/components/video/VideoTemplate.tsx"

echo "Checking recording lifecycle..."

if ! grep -q "startRecording" "$HOOKS_FILE"; then
  echo "FAIL: hooks.ts missing window.startRecording call"
  exit 1
fi

if ! grep -q "stopRecording" "$HOOKS_FILE"; then
  echo "FAIL: hooks.ts missing window.stopRecording call"
  exit 1
fi

if ! grep -q "useVideoPlayer" "$TEMPLATE_FILE"; then
  echo "FAIL: VideoTemplate.tsx missing useVideoPlayer"
  exit 1
fi

if ! grep -q "AnimatePresence" "$TEMPLATE_FILE"; then
  echo "FAIL: VideoTemplate.tsx missing AnimatePresence"
  exit 1
fi

echo "OK: recording lifecycle is correctly wired"
