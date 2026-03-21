<div align="center">

<img src="https://img.shields.io/badge/YTDrop-YouTube%20Converter-e8ff47?style=for-the-badge&logo=youtube&logoColor=black" alt="YTDrop" />

# 🎵 YTDrop — YouTube to MP3 / MP4 Converter

**Free · No Signup · Runs Locally · Powered by yt-dlp**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![yt-dlp](https://img.shields.io/badge/yt--dlp-Latest-e8ff47?style=flat-square&logo=youtube&logoColor=black)](https://github.com/yt-dlp/yt-dlp)
[![ffmpeg](https://img.shields.io/badge/ffmpeg-Required-007808?style=flat-square&logo=ffmpeg&logoColor=white)](https://ffmpeg.org)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Mac%20%7C%20Linux-lightgrey?style=flat-square)]()

<br/>

<img src="https://img.shields.io/badge/●%20Best%20Audio%20Quality-e8ff47?style=flat-square&labelColor=111" />
<img src="https://img.shields.io/badge/●%20Up%20to%201080p%20Video-ff5c5c?style=flat-square&labelColor=111" />
<img src="https://img.shields.io/badge/●%20Instant%20Download-5c8fff?style=flat-square&labelColor=111" />

<br/><br/>

### 🚀 [Live Demo → ytdrop-production.up.railway.app](https://ytdrop-production.up.railway.app)

[![Live Demo](https://img.shields.io/badge/🌐%20Live%20Demo-Visit%20YTDrop-e8ff47?style=for-the-badge&labelColor=111111)](https://ytdrop-production.up.railway.app)

</div>

---

## ✨ Overview

**YTDrop** is a self-hosted, no-registration YouTube downloader that converts any YouTube video directly to **MP3** (audio) or **MP4** (video) on your own machine. No third-party services. No ads. No data collection. Everything runs locally via a Node.js + Express backend powered by the battle-tested `yt-dlp` engine.

> 🔒 **Your downloads never leave your machine.**

---

## 🖥️ Preview

```
┌─────────────────────────────────────────────────┐
│          YTDrop — YouTube Converter              │
│                                                  │
│  [ https://youtube.com/watch?v=... ] [ Paste ]   │
│                                                  │
│  ┌─────────────────┐  ┌─────────────────────┐   │
│  │  🎵  MP3        │  │  🎬  MP4            │   │
│  │  Audio · Best   │  │  Video + Audio      │   │
│  └─────────────────┘  └─────────────────────┘   │
│                                                  │
│         [ Convert & Download ]                   │
│  ████████████████████████████  100%  Ready!      │
└─────────────────────────────────────────────────┘
```

---

## 🚀 Features

| Feature | Details |
|---|---|
| 🎵 **MP3 Export** | Best quality VBR ~320kbps, with metadata |
| 🎬 **MP4 Export** | Up to 1080p, H264 video + AAC audio |
| ⚡ **Real-time Progress** | Live progress bar polling every second |
| 🖼️ **Video Preview** | Thumbnail, title, channel, duration shown |
| 🧹 **Auto Cleanup** | Downloaded files deleted after serving |
| 🔒 **No Login** | Zero accounts, zero tracking, zero ads |
| 💻 **100% Local** | Runs on your machine via Node.js + yt-dlp |

---

## 📦 Prerequisites

Make sure these are installed before running YTDrop:

### 1️⃣ Node.js (v18+)
```bash
# Download from
https://nodejs.org
```

### 2️⃣ yt-dlp
```bash
# Windows
winget install yt-dlp

# macOS
brew install yt-dlp

# Linux
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  -o /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp
```

### 3️⃣ ffmpeg
```bash
# Windows
winget install ffmpeg

# macOS
brew install ffmpeg

# Linux (Ubuntu/Debian)
sudo apt install ffmpeg
```

---

## ⚙️ Installation & Setup

```bash
# 1. Clone the repository
git clone https://github.com/ankitbhartii/ytdrop.git

# 2. Navigate into the project
cd ytdrop

# 3. Install dependencies
npm install

# 4. Start the server
npm start
```

Then open your browser and go to:

```
https://ytdrop-production.up.railway.app/
```

> 💡 For auto-restart on file changes during development:
> ```bash
> npm run dev
> ```

---

## 🎯 How It Works

```
  User pastes URL
        │
        ▼
  [Express Server]  ──►  yt-dlp fetches video info
        │
        ▼
  User selects MP3 / MP4 + quality
        │
        ▼
  [yt-dlp] downloads & converts
        │
        ├── MP3: extracts audio → converts to MP3 (320kbps VBR)
        └── MP4: merges best video + AAC audio → MP4
        │
        ▼
  File served to browser → auto-deleted from server
```

---

## 📁 Project Structure

```
ytdrop/
├── 📄 server.js          ← Express backend (API + yt-dlp integration)
├── 📄 package.json       ← Dependencies & npm scripts
├── 📄 .gitignore         ← Ignored files (node_modules, downloads, etc.)
├── 📄 README.md          ← You are here
├── 📁 public/
│   └── 📄 index.html     ← Frontend UI (single page app)
└── 📁 downloads/         ← Temp folder (auto-cleaned, not committed)
```

---

## 🛠️ API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/info?url=` | Fetch video title, thumbnail, duration |
| `POST` | `/api/convert` | Start a conversion job, returns `jobId` |
| `GET` | `/api/status/:jobId` | Poll conversion progress (0–100%) |
| `GET` | `/api/download/:file` | Download the converted file |

---

## 🔧 Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| Rate limit | `200 req/min` | Per-IP request limit |
| File TTL | `1 hour` | Auto-delete converted files after |

---

## ❗ Troubleshooting

| Problem | Fix |
|---|---|
| `yt-dlp not found` | Restart VS Code / terminal after installing |
| Silent MP4 video | Server re-encodes audio to AAC automatically |
| `Too many requests` | Restart server to reset rate limiter |
| Port already in use | Change `PORT` in `server.js` to `3001` |
| Video unavailable | Update yt-dlp: `yt-dlp -U` |

---

## 🔄 Keeping yt-dlp Updated

YouTube changes frequently. Update yt-dlp regularly to avoid breakage:

```bash
yt-dlp -U
```

---

## ⚠️ Disclaimer

YTDrop is intended for **personal use only**. Please respect:
- [YouTube's Terms of Service](https://www.youtube.com/t/terms)
- Copyright laws in your country
- Content creators' rights

Do not use this tool to download copyrighted content without permission.

---

## 👨‍💻 Author

<div align="center">

**Ankit Bharti**

[![GitHub](https://img.shields.io/badge/GitHub-ankitbhartii-181717?style=flat-square&logo=github)](https://github.com/ankitbhartii)

</div>

---

<div align="center">

Made with ❤️ and ☕ &nbsp;|&nbsp; Built with Node.js, Express & yt-dlp

⭐ **Star this repo if you found it useful!** ⭐

</div>