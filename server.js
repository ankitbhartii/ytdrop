const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { v4: uuidv4 } = require("uuid");
const ytdlp = require("yt-dlp-exec");

const app = express();

// IMPORTANT for Railway (fixes proxy + rate limit issue)
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;
const DOWNLOADS_DIR = path.join(__dirname, "downloads");

// Ensure downloads folder exists
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// ================= MIDDLEWARE =================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
});
app.use(limiter);

// ================= DOWNLOAD ROUTE =================
app.post("/api/download", async (req, res) => {
  try {
    const { url, format } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL required" });
    }

    const id = uuidv4();
    const output = path.join(DOWNLOADS_DIR, `${id}.%(ext)s`);

    // Download using yt-dlp-exec (NO python needed)
    if (format === "mp3") {
      await ytdlp(url, {
        extractAudio: true,
        audioFormat: "mp3",
        output: output,
      });
    } else {
      await ytdlp(url, {
        format: "best",
        output: output,
      });
    }

    // Find downloaded file
    const file = fs
      .readdirSync(DOWNLOADS_DIR)
      .find((f) => f.startsWith(id));

    if (!file) {
      return res.status(500).json({ error: "File not found after download" });
    }

    res.json({ file });
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({ error: "Download failed" });
  }
});

// ================= SERVE FILE =================
app.get("/api/download/:file", (req, res) => {
  const filePath = path.join(DOWNLOADS_DIR, req.params.file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  res.download(filePath, () => {
    // Delete file after sending
    setTimeout(() => {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error("Cleanup error:", err);
      }
    }, 5000);
  });
});

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("YTDrop is live 🚀");
});

// ================= START SERVER =================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});