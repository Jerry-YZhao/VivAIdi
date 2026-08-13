# VivAIdi

Hum a melody. Conduct a 16-bar ensemble with your hands.

## Pipeline

1. **Compose** — [Spotify Basic Pitch](https://basicpitch.spotify.com) transcribes the hum
2. **Arrange** — a 16-bar composer writes independent Lead / Harmony / Body / Bass parts
3. **Conduct** — [MediaPipe](https://ai.google.dev/edge/mediapipe) Hands: spread cues sections, height is dynamics, left/right pans strings/brass, fist cuts, open palm is tutti

Playback is FluidR3 SoundFonts so each section can be conducted live.

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Mic and camera need localhost or HTTPS.
