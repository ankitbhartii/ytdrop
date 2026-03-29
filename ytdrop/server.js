const express = require("express");
const { execFile, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;
const DOWNLOADS_DIR = path.join(__dirname, "downloads");

// ── Ensure downloads dir exists ──────────────────────────────────────────────
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR);

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Rate limit: 20 conversions per IP per 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/", limiter);

// ── Helper: validate YouTube URL ─────────────────────────────────────────────
function extractVideoId(url) {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /embed\/([a-zA-Z0-9_-]{11})/,
    /shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

// ── Helper: run yt-dlp as a promise ─────────────────────────────────────────
function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr || `yt-dlp exited with code ${code}`));
    });
  });
}

// ── Cleanup old files (older than 1 hour) ───────────────────────────────────
function cleanupOldFiles() {
  const now = Date.now();
  fs.readdirSync(DOWNLOADS_DIR).forEach((file) => {
    const fp = path.join(DOWNLOADS_DIR, file);
    try {
      const stat = fs.statSync(fp);
      if (now - stat.mtimeMs > 60 * 60 * 1000) fs.unlinkSync(fp);
    } catch (_) {}
  });
}
setInterval(cleanupOldFiles, 30 * 60 * 1000); // every 30 min

// ── GET /api/info — fetch video metadata ─────────────────────────────────────
app.get("/api/info", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url parameter" });

  const videoId = extractVideoId(url);
  if (!videoId) return res.status(400).json({ error: "Invalid YouTube URL" });

  try {
    const raw = await runYtDlp([
      "--dump-json",
      "--no-playlist",
      "--no-warnings",
      `https://www.youtube.com/watch?v=${videoId}`,
    ]);

    const info = JSON.parse(raw);

    // Build available formats
    const videoFormats = (info.formats || [])
      .filter((f) => f.vcodec !== "none" && f.acodec !== "none" && f.ext === "mp4")
      .map((f) => ({ itag: f.format_id, quality: f.format_note || f.height + "p", ext: "mp4" }))
      .filter((f, i, arr) => arr.findIndex((x) => x.quality === f.quality) === i)
      .sort((a, b) => parseInt(b.quality) - parseInt(a.quality));

    res.json({
      id: videoId,
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration_string || formatDuration(info.duration),
      channel: info.uploader,
      videoFormats: videoFormats.slice(0, 5),
    });
  } catch (err) {
    console.error("Info error:", err.message);
    res.status(500).json({ error: "Could not fetch video info. It may be private or unavailable." });
  }
});

// ── POST /api/convert — kick off conversion ──────────────────────────────────
app.post("/api/convert", async (req, res) => {
  const { url, format, quality } = req.body;
  if (!url || !format) return res.status(400).json({ error: "Missing parameters" });

  const videoId = extractVideoId(url);
  if (!videoId) return res.status(400).json({ error: "Invalid YouTube URL" });

  const jobId = uuidv4();
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // Respond immediately with job ID
  res.json({ jobId });

  // Run conversion in background
  const outputPath = path.join(DOWNLOADS_DIR, jobId);
  jobs[jobId] = { status: "processing", progress: 0, file: null, error: null, title: "" };

  try {
    let args;

    if (format === "mp3") {
      args = [
        "-x",                          // extract audio
        "--audio-format", "mp3",
        "--audio-quality", "0",        // best quality (VBR ~320kbps)
        "--embed-thumbnail",
        "--add-metadata",
        "--no-playlist",
        "--no-warnings",
        "-o", outputPath + ".%(ext)s",
        ytUrl,
      ];
    } else {
      // MP4 video — pick quality
      const heightMap = { "1080p": 1080, "720p": 720, "480p": 480, "360p": 360 };
      const height = heightMap[quality] || 720;
      args = [
        "-f", `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${height}][ext=mp4]/best`,
        "--merge-output-format", "mp4",
        "--add-metadata",
        "--no-playlist",
        "--no-warnings",
        "-o", outputPath + ".%(ext)s",
        ytUrl,
      ];
    }

    // Stream progress
    const proc = spawn("yt-dlp", args);
    let titleCaptured = false;

    proc.stdout.on("data", (chunk) => {
      const line = chunk.toString();
      // Parse progress like "[download]  45.3% of ..."
      const pctMatch = line.match(/\[download\]\s+([\d.]+)%/);
      if (pctMatch) {
        jobs[jobId].progress = Math.round(parseFloat(pctMatch[1]));
      }
      if (!titleCaptured && line.includes("[info]")) {
        const tm = line.match(/\[info\] ([^\n]+)/);
        if (tm) { jobs[jobId].title = tm[1]; titleCaptured = true; }
      }
    });

    proc.stderr.on("data", (chunk) => {
      const line = chunk.toString();
      const pctMatch = line.match(/\[download\]\s+([\d.]+)%/);
      if (pctMatch) jobs[jobId].progress = Math.round(parseFloat(pctMatch[1]));
    });

    proc.on("close", (code) => {
      if (code === 0) {
        // Find the actual output file
        const ext = format === "mp3" ? "mp3" : "mp4";
        const finalFile = outputPath + "." + ext;
        if (fs.existsSync(finalFile)) {
          jobs[jobId].status = "done";
          jobs[jobId].progress = 100;
          jobs[jobId].file = jobId + "." + ext;
        } else {
          // Glob for any file with this jobId
          const files = fs.readdirSync(DOWNLOADS_DIR).filter((f) => f.startsWith(jobId));
          if (files.length > 0) {
            jobs[jobId].status = "done";
            jobs[jobId].progress = 100;
            jobs[jobId].file = files[0];
          } else {
            jobs[jobId].status = "error";
            jobs[jobId].error = "Output file not found after conversion.";
          }
        }
      } else {
        jobs[jobId].status = "error";
        jobs[jobId].error = "Conversion failed. The video may be restricted.";
      }
    });
  } catch (err) {
    jobs[jobId].status = "error";
    jobs[jobId].error = err.message;
  }
});

// ── In-memory job store ──────────────────────────────────────────────────────
const jobs = {};

// ── GET /api/status/:jobId — poll job status ─────────────────────────────────
app.get("/api/status/:jobId", (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(job);
});

// ── GET /api/download/:filename — serve the file ─────────────────────────────
app.get("/api/download/:filename", (req, res) => {
  const filename = path.basename(req.params.filename); // prevent path traversal
  const filepath = path.join(DOWNLOADS_DIR, filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: "File not found or expired" });
  }

  const ext = path.extname(filename).slice(1);
  const mimeMap = { mp3: "audio/mpeg", mp4: "video/mp4" };
  res.setHeader("Content-Type", mimeMap[ext] || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="ytdrop-${filename}"`);

  const stream = fs.createReadStream(filepath);
  stream.pipe(res);

  // Delete after download
  stream.on("close", () => {
    try { fs.unlinkSync(filepath); } catch (_) {}
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatDuration(seconds) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🎵 YTDrop server running at http://localhost:${PORT}`);
});
