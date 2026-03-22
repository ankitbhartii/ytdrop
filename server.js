const express = require('express');
const { exec } = require('child_process');
const queue = require('bull');
const app = express();
app.use(express.json());

// Job queue for downloads
const downloadQueue = new queue('download');

// API endpoint to get video info
app.get('/api/info', (req, res) => {
    const url = req.query.url;
    exec(`yt-dlp -j ${url}`, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: stderr });
        }
        res.json(JSON.parse(stdout));
    });
});

// API endpoint to convert video
app.post('/api/convert', (req, res) => {
    const url = req.body.url;
    const format = req.body.format || 'mp4';
    // Add job to queue
    downloadQueue.add({ url, format });
    res.json({ status: 'Job added to queue' });
});

// Job processing
downloadQueue.process(async (job, done) => {
    const { url, format } = job.data;
    exec(`yt-dlp -f ${format} ${url}`, (error, stdout, stderr) => {
        if (error) {
            return done(new Error(stderr));
        }
        done();
    });
});

// API endpoint to check job status
app.get('/api/status/:jobId', (req, res) => {
    const jobId = req.params.jobId;
    downloadQueue.getJob(jobId).then(job => {
        if (!job) return res.status(404).json({ error: 'Job not found' });
        res.json({ status: job.finished() ? 'completed' : 'in progress' });
    });
});

// API endpoint to download
app.get('/api/download/:jobId', (req, res) => {
    const jobId = req.params.jobId;
    downloadQueue.getJob(jobId).then(job => {
        if (!job || !job.finished()) return res.status(404).json({ error: 'Job not found or not completed' });
        // Here you would handle sending the file back to the user
        res.download(`./downloads/${jobId}.${job.data.format}`);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});