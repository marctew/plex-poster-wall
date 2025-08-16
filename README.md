# Plex Poster Wall

Portrait poster wall that cycles through *recently added* items in selected Plex libraries and flips to *Now Playing* when something is being watched. Includes a dark-mode WebUI for configuration.

## Features
- Portrait (vertical) display view with animated poster carousel
- Auto-switch to **Now Playing** with fanart background, poster, title, progress bar, and user/player info
- WebUI to configure:
  - Plex URL + Token
  - Library selection (one or more)
  - Filter which **users** or **players** trigger Now Playing
  - Carousel speed & count
- Real-time updates via WebSocket (instant flip to Now Playing)
- SQLite config storage; environment variable fallbacks

## Quick Start

### 1) Server
```bash
cd server
cp .env.example .env   # optional; you can also set via WebUI later
npm install
npm run dev            # or: npm start (prod)
