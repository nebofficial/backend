const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { uploadFileToFTP } = require('../utils/ftpUpload');
const { auth } = require('../middleware/auth');
const fs = require('fs').promises;
const os = require('os');

// Configure multer for temporary storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, os.tmpdir()),
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({ storage });

// Upload endpoint
router.post('/', auth, upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    try {
        // Upload to FTP
        const remoteName = path.basename(req.file.filename);
        const uploadPath = `course-images/${remoteName}`;
        const url = await uploadFileToFTP(req.file.path, uploadPath);

        // Return the URL
        res.json({ url });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ message: 'Failed to upload file' });
    } finally {
        // Clean up temp file
        await fs.unlink(req.file.path).catch(console.error);
    }
});

module.exports = router;
