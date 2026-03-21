const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;
const DOWNLOADS_DIR = path.join(__dirname, "downloads");

// Ensure downloads dir exists
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 200,
});
app.use("/api/", limiter);

// In-memory jobs
const jobs = {};

// Extract YouTube ID
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

// Find output file
function findOutputFile(jobId) {
  try {
    const files = fs.readdirSync(DOWNLOADS_DIR);
    const match = files.find((f) => f.startsWith(jobId));
    return match ? path.join(DOWNLOADS_DIR, match) : null;
  } catch {
    return null;
  }
}

// Cleanup old files
setInterval(() => {
  try {
    const now = Date.now();
    fs.readdirSync(DOWNLOADS_DIR).forEach((file) => {
      const fp = path.join(DOWNLOADS_DIR, file);
      if (now - fs.statSync(fp).mtimeMs > 60 * 60 * 1000) {
        fs.unlinkSync(fp);
      }
    });
  } catch {}
}, 30 * 60 * 1000);

// ------------------ INFO API ------------------
app.get("/api/info", (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url" });

  const videoId = extractVideoId(url);
  if (!videoId) return res.status(400).json({ error: "Invalid URL" });

  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

  const proc = spawn("python3", [
    "-m",
    "yt_dlp",
    "--dump-json",
    "--no-playlist",
    "--no-warnings",
    ytUrl,
  ]);

  let stdout = "";
  let stderr = "";

  proc.stdout.on("data", (d) => (stdout += d.toString()));
  proc.stderr.on("data", (d) => (stderr += d.toString()));

  proc.on("close", (code) => {
    if (code !== 0) {
      return res.status(500).json({ error: "Failed to fetch video info" });
    }
    try {
      const info = JSON.parse(stdout);
      res.json({
        title: info.title,
        thumbnail: info.thumbnail,
        duration: info.duration_string,
        channel: info.uploader,
      });
    } catch {
      res.status(500).json({ error: "Parsing error" });
    }
  });

  proc.on("error", (e) => {
    res.status(500).json({ error: e.message });
  });
});

// ------------------ CONVERT API ------------------
app.post("/api/convert", (req, res) => {
  const { url, format, quality } = req.body;
  if (!url || !format) return res.status(400).json({ error: "Missing params" });

  const videoId = extractVideoId(url);
  if (!videoId) return res.status(400).json({ error: "Invalid URL" });

  const jobId = uuidv4();
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const output = path.join(DOWNLOADS_DIR, `${jobId}.%(ext)s`);

  jobs[jobId] = { status: "processing", progress: 0 };

  res.json({ jobId });

  let args;

  if (format === "mp3") {
    args = [
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      "-o",
      output,
      ytUrl,
    ];
  } else {
    const height = quality === "1080p" ? 1080 : 720;
    args = [
      "-f",
      `bestvideo[height<=${height}]+bestaudio/best`,
      "--merge-output-format",
      "mp4",
      "-o",
      output,
      ytUrl,
    ];
  }

  const proc = spawn("python3", ["-m", "yt_dlp", ...args]);

  proc.stdout.on("data", (data) => {
    const line = data.toString();
    const match = line.match(/(\d+\.?\d*)%/);
    if (match) {
      jobs[jobId].progress = Math.round(parseFloat(match[1]));
    }
  });

  proc.on("close", (code) => {
    if (code !== 0) {
      jobs[jobId].status = "error";
      return;
    }

    const file = findOutputFile(jobId);
    if (file) {
      jobs[jobId].status = "done";
      jobs[jobId].file = path.basename(file);
    } else {
      jobs[jobId].status = "error";
    }
  });

  proc.on("error", (e) => {
    jobs[jobId].status = "error";
  });
});

// ------------------ STATUS ------------------
app.get("/api/status/:jobId", (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: "Not found" });
  res.json(job);
});

// ------------------ DOWNLOAD ------------------
app.get("/api/download/:file", (req, res) => {
  const file = path.join(DOWNLOADS_DIR, req.params.file);

  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.download(file, () => {
    setTimeout(() => {
      try {
        fs.unlinkSync(file);
      } catch {}
    }, 3000);
  });
});

// Root route
app.get("/", (req, res) => {
  res.send("YTDrop is live 🚀");
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});