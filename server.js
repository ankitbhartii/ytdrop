const express = require('express');
const { execFile } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const jobMap = new Map();

// API endpoint: /api/info
app.get('/api/info', (req, res) => {
    // Implement info retrieval logic
    res.json({ message: 'API Info: this is a video download API using yt-dlp and ffmpeg.' });
});

// API endpoint: /api/convert
app.post('/api/convert', (req, res) => {
    const { url, format } = req.body;
    const jobId = Date.now().toString();

    jobMap.set(jobId, { status: 'in progress', progress: 0 });

    // Call yt-dlp to get video details
    execFile('yt-dlp', ['-f', format, url], (error, stdout, stderr) => {
        if (error) {
            jobMap.set(jobId, { status: 'error', error: stderr });
            return res.status(500).json({ error: stderr });
        }

        const outputFile = `${url.split('/').pop()}.${format}`;
        // ffmpeg conversion process
        ffmpeg(stdout)
            .toFormat(format)
            .on('progress', (progress) => {
                jobMap.set(jobId, { status: 'in progress', progress: progress.percent });
            })
            .on('end', () => {
                jobMap.set(jobId, { status: 'completed', file: outputFile });
                res.json({ jobId, message: 'Conversion completed', file: outputFile });
            })
            .on('error', (err) => {
                jobMap.set(jobId, { status: 'error', error: err.message });
                res.status(500).json({ error: err.message });
            })
            .save(outputFile);
    });
});

// API endpoint: /api/status/:jobId
app.get('/api/status/:jobId', (req, res) => {
    const { jobId } = req.params;
    const jobStatus = jobMap.get(jobId);
    if (jobStatus) {
        return res.json(jobStatus);
    } else {
        return res.status(404).json({ error: 'Job not found' });
    }
});

// API endpoint: /api/download/:file
app.get('/api/download/:file', (req, res) => {
    const filePath = req.params.file;
    res.download(filePath, (err) => {
        if (err) {
            console.log('Error downloading file:', err);
            res.status(500).send('Error downloading file');
        }
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});