import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { removeBackground } from './lib/clipdrop.js';
import { flipImageHorizontally, convertToPng } from './lib/imageProcessor.js';
import { uploadImage, deleteImage, fileExists, getPublicUrl } from './lib/storage.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
    fileFilter: (_req, file, cb) => {

        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Please upload an image file.'));
        }
    },
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Upload and process image
app.post('/api/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        const imageId = uuidv4();
        const originalBuffer = req.file.buffer;

        // Convert to PNG for API compatibility

        const pngBuffer = await convertToPng(originalBuffer);

        // Remove background

        const noBgBuffer = await removeBackground(pngBuffer);

        // Flip horizontally

        const processedBuffer = await flipImageHorizontally(noBgBuffer);

        // Upload processed image to GCS

        const processedFileName = `processed/${imageId}.png`;
        const processedUrl = await uploadImage(processedBuffer, processedFileName, 'image/png');

        res.json({
            success: true,
            imageId,
            processedUrl,
            message: 'Image processed successfully',
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to process image',
        });
    }
});

// Download processed image
app.get('/api/download/:id', async (req, res) => {
    try {
        const imageId = req.params.id;
        const fileName = `processed/${imageId}.png`;

        const exists = await fileExists(fileName);
        if (!exists) {
            return res.status(404).json({ error: 'Image not found' });
        }

        // Fetch from GCS
        const response = await fetch(`https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${fileName}`);
        const buffer = Buffer.from(await response.arrayBuffer());

        // Determine filename
        let downloadName = `processed-${imageId}.png`;
        const queryName = req.query.filename as string;
        if (queryName) {
            // Remove extension if present and add -processed.png
            const baseName = queryName.replace(/\.[^/.]+$/, "");
            downloadName = `${baseName}-processed.png`;
        }

        // Set headers for download
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
        res.send(buffer);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Failed to download image' });
    }
});

// Delete processed image from GCS
app.delete('/api/delete', async (req, res) => {
    try {
        const imageId = req.query.imageId as string;

        if (!imageId) {
            return res.status(400).json({ error: 'Image ID is required' });
        }

        const processedFileName = `processed/${imageId}.png`;
        const exists = await fileExists(processedFileName);

        if (!exists) {
            return res.status(404).json({ error: 'Image not found' });
        }

        await deleteImage(processedFileName);

        res.json({ success: true, message: 'Image deleted successfully' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to delete image',
        });
    }
});

// Get image URLs
app.get('/api/images/:id', async (req, res) => {
    try {
        const imageId = req.params.id;

        if (!imageId) {
            return res.status(400).json({ error: 'Image ID is required' });
        }

        const originalFileName = `originals/${imageId}.png`;
        const processedFileName = `processed/${imageId}.png`;

        const [originalExists, processedExists] = await Promise.all([
            fileExists(originalFileName),
            fileExists(processedFileName),
        ]);

        if (!originalExists && !processedExists) {
            return res.status(404).json({ error: 'Image not found' });
        }

        res.json({
            imageId,
            originalUrl: originalExists ? getPublicUrl(originalFileName) : null,
            processedUrl: processedExists ? getPublicUrl(processedFileName) : null,
        });
    } catch (error) {
        console.error('Get image error:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to get image',
        });
    }
});

// Only start the server if not running on Vercel
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`🚀 Backend server running on http://localhost:${PORT}`);
    });
}

export default app;
