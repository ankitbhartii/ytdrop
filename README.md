🎵 YTDrop — YouTube to MP3 / MP4 Converter
A self-hosted, no-login YouTube converter powered by yt-dlp and Node.js.
---
✅ Prerequisites
Install these first:
1. Node.js (v18+)
Download from https://nodejs.org
2. yt-dlp
```bash
# macOS
brew install yt-dlp

# Linux
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp

# Windows
winget install yt-dlp
# or download yt-dlp.exe from https://github.com/yt-dlp/yt-dlp/releases and add to PATH
```
3. ffmpeg (required for MP3 extraction & stream merging)
```bash
# macOS
brew install ffmpeg

# Ubuntu / Debian
sudo apt install ffmpeg

# Windows
winget install ffmpeg
# or download from https://ffmpeg.org/download.html and add to PATH
```
---
🚀 Setup & Run
```bash
# 1. Enter the project folder
cd ytdrop

# 2. Install Node dependencies
npm install

# 3. Start the server
npm start
```
Then open your browser at → http://localhost:3000
---
🛠 Development (auto-restart on file change)
```bash
npm run dev
```
---
📁 Project Structure
```
ytdrop/
├── server.js          ← Express backend (yt-dlp integration)
├── package.json
├── public/
│   └── index.html     ← Frontend UI (served at /)
└── downloads/         ← Temp folder; files auto-deleted after download
```
---
⚙️ How it works
Paste a YouTube URL in the input
Choose MP3 (audio, ~320kbps VBR) or MP4 (up to 1080p)
Hit Convert & Download — the server runs `yt-dlp` and streams the file back
Files are deleted automatically after download (or after 1 hour)
---
🔒 Notes
Runs entirely on your local machine — nothing is sent to third parties
Rate limited to 20 requests per IP per 15 minutes
For personal use only — respect YouTube's Terms of Service
Keep `yt-dlp` updated regularly: `yt-dlp -U`
---
🔄 Updating yt-dlp (important!)
YouTube frequently changes its format — keep yt-dlp fresh:
```bash
yt-dlp -U
```