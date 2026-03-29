const express = require("express");
const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;
const DOWNLOADS_DIR = path.join(__dirname, "downloads");

// ── Ensure downloads dir exists ──────────────────────────────────────────────
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 200,
  message: { error: "Too many requests, please try again in a moment." },
});
app.use("/api/", limiter);

// ── In-memory job store ──────────────────────────────────────────────────────
const jobs = {};

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

// ── Helper: find yt-dlp binary ────────────────────────────────────────────────
function getYtDlpBin() {
  // Try 'which' on Linux/Mac first
  try {
    const result = execSync("which yt-dlp", { encoding: "utf8" }).trim();
    if (result) {
      console.log(`[bin] Found yt-dlp at: ${result}`);
      return result;
    }
  } catch (_) {}

  // Common Linux/Nix/Windows paths
  const candidates = [
    "/usr/bin/yt-dlp",
    "/usr/local/bin/yt-dlp",
    "/nix/var/nix/profiles/default/bin/yt-dlp",
    "/root/.nix-profile/bin/yt-dlp",
    "yt-dlp",
    "yt-dlp.exe",
    "C:\\Windows\\System32\\yt-dlp.exe",
  ];

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) {
        console.log(`[bin] Found yt-dlp at: ${c}`);
        return c;
      }
    } catch (_) {}
  }

  console.log("[bin] Falling back to: yt-dlp");
  return "yt-dlp";
}

// Cache the binary path so we don't re-search on every request
const YT_DLP_BIN = getYtDlpBin();

// ── Helper: find output file for a job ───────────────────────────────────────
function findOutputFile(jobId) {
  try {
    const files = fs.readdirSync(DOWNLOADS_DIR);
    const match = files.find((f) => f.startsWith(jobId));
    return match ? path.join(DOWNLOADS_DIR, match) : null;
  } catch (_) {
    return null;
  }
}

// ── Cleanup files older than 1 hour ──────────────────────────────────────────
function cleanupOldFiles() {
  try {
    const now = Date.now();
    fs.readdirSync(DOWNLOADS_DIR).forEach((file) => {
      const fp = path.join(DOWNLOADS_DIR, file);
      try {
        if (now - fs.statSync(fp).mtimeMs > 60 * 60 * 1000) fs.unlinkSync(fp);
      } catch (_) {}
    });
  } catch (_) {}
}
setInterval(cleanupOldFiles, 30 * 60 * 1000);

// ── GET /api/info ─────────────────────────────────────────────────────────────
app.get("/api/info", (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url parameter" });

  const videoId = extractVideoId(url);
  if (!videoId) return res.status(400).json({ error: "Invalid YouTube URL" });

  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

  console.log(`[info] Fetching: ${ytUrl}`);
  console.log(`[info] Using binary: ${YT_DLP_BIN}`);

  const proc = spawn(YT_DLP_BIN, ["--dump-json", "--no-playlist", "--no-warnings", ytUrl]);
  let stdout = "";
  let stderr = "";

  proc.stdout.on("data", (d) => (stdout += d.toString()));
  proc.stderr.on("data", (d) => (stderr += d.toString()));

  proc.on("close", (code) => {
    console.log(`[info] exit code ${code}`);
    if (code !== 0) {
      console.error("[info] stderr:", stderr.slice(0, 400));
      return res.status(500).json({ error: "Could not fetch video info. It may be private or unavailable." });
    }
    try {
      const info = JSON.parse(stdout);
      res.json({
        id: videoId,
        title: info.title || "Unknown Title",
        thumbnail: info.thumbnail || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        duration: info.duration_string || formatDuration(info.duration),
        channel: info.uploader || "",
      });
    } catch (e) {
      console.error("[info] JSON parse error:", e.message);
      res.status(500).json({ error: "Failed to parse video info." });
    }
  });

  proc.on("error", (e) => {
    console.error("[info] spawn error:", e.message);
    res.status(500).json({ error: `yt-dlp failed to start: ${e.message}` });
  });
});

// ── POST /api/convert ─────────────────────────────────────────────────────────
app.post("/api/convert", (req, res) => {
  const { url, format, quality } = req.body;
  if (!url || !format) return res.status(400).json({ error: "Missing parameters" });

  const videoId = extractVideoId(url);
  if (!videoId) return res.status(400).json({ error: "Invalid YouTube URL" });

  const jobId = uuidv4();
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const outputTemplate = path.join(DOWNLOADS_DIR, `${jobId}.%(ext)s`);

  jobs[jobId] = { status: "processing", progress: 0, file: null, error: null };
  res.json({ jobId });

  let args;

  if (format === "mp3") {
    args = [
      "-x",
      "--audio-format", "mp3",
      "--audio-quality", "0",
      "--no-playlist",
      "--no-warnings",
      "--newline",
      "-o", outputTemplate,
      ytUrl,
    ];
  } else {
    const heightMap = { "1080p": 1080, "720p": 720, "480p": 480, "360p": 360 };
    const height = heightMap[quality] || 720;
    args = [
      "-f", `bestvideo[vcodec^=avc][height<=${height}]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best`,
      "--merge-output-format", "mp4",
      "--no-playlist",
      "--no-warnings",
      "--newline",
      "--postprocessor-args", "ffmpeg:-c:v copy -c:a aac -b:a 192k",
      "-o", outputTemplate,
      ytUrl,
    ];
  }

  console.log(`[convert] Job ${jobId} | format=${format} quality=${quality}`);
  console.log(`[convert] Binary: ${YT_DLP_BIN}`);

  const proc = spawn(YT_DLP_BIN, args, { windowsHide: true });
  let stderrBuf = "";

  const parseProgress = (line) => {
    const m = line.match(/\[download\]\s+([\d.]+)%/);
    if (m) jobs[jobId].progress = Math.round(parseFloat(m[1]));
  };

  proc.stdout.on("data", (chunk) => {
    chunk.toString().split("\n").forEach((line) => {
      if (line.trim()) {
        console.log(`[yt-dlp] ${line.trim()}`);
        parseProgress(line);
      }
    });
  });

  proc.stderr.on("data", (chunk) => {
    chunk.toString().split("\n").forEach((line) => {
      if (line.trim()) {
        console.log(`[yt-dlp err] ${line.trim()}`);
        stderrBuf += line + "\n";
        parseProgress(line);
      }
    });
  });

  proc.on("error", (e) => {
    console.error(`[convert] Spawn error:`, e.message);
    jobs[jobId].status = "error";
    jobs[jobId].error = `Failed to start yt-dlp: ${e.message}`;
  });

  proc.on("close", (code) => {
    console.log(`[convert] Job ${jobId} exited with code ${code}`);

    if (code !== 0) {
      const err = stderrBuf.includes("Sign in") ? "This video requires sign-in or is age-restricted."
        : stderrBuf.includes("Private video") ? "This video is private."
        : stderrBuf.includes("not available") ? "This video is not available in your region."
        : `Conversion failed (exit ${code}). Check logs for details.`;
      jobs[jobId].status = "error";
      jobs[jobId].error = err;
      return;
    }

    const outputFile = findOutputFile(jobId);
    console.log(`[convert] Output file: ${outputFile}`);

    if (outputFile && fs.existsSync(outputFile)) {
      const sizeMB = (fs.statSync(outputFile).size / 1024 / 1024).toFixed(2);
      console.log(`[convert] SUCCESS - ${sizeMB} MB`);
      jobs[jobId].status = "done";
      jobs[jobId].progress = 100;
      jobs[jobId].file = path.basename(outputFile);
    } else {
      console.error(`[convert] File not found. Dir:`, fs.readdirSync(DOWNLOADS_DIR));
      jobs[jobId].status = "error";
      jobs[jobId].error = "File not found after conversion. Check logs for details.";
    }
  });
});

// ── GET /api/status/:jobId ────────────────────────────────────────────────────
app.get("/api/status/:jobId", (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(job);
});

// ── GET /api/download/:filename ───────────────────────────────────────────────
app.get("/api/download/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  const filepath = path.join(DOWNLOADS_DIR, filename);

  console.log(`[download] Serving: ${filepath}`);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: "File not found or already downloaded." });
  }

  const ext = path.extname(filename).slice(1).toLowerCase();
  const mimeMap = { mp3: "audio/mpeg", mp4: "video/mp4", webm: "video/webm", m4a: "audio/mp4" };

  res.setHeader("Content-Type", mimeMap[ext] || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="ytdrop-download.${ext}"`);
  res.setHeader("Content-Length", fs.statSync(filepath).size);

  const stream = fs.createReadStream(filepath);
  stream.pipe(res);
  stream.on("end", () => {
    setTimeout(() => {
      try { fs.unlinkSync(filepath); console.log(`[download] Deleted: ${filename}`); } catch (_) {}
    }, 3000);
  });
  stream.on("error", (e) => console.error(`[download] Stream error:`, e.message));
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDuration(seconds) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎵 YTDrop running at http://localhost:${PORT}`);
  console.log(`📁 Downloads: ${DOWNLOADS_DIR}`);
  console.log(`🔧 yt-dlp binary: ${YT_DLP_BIN}\n`);
});