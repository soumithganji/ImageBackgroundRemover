import { useState, useCallback } from 'react';
import ImageUploader from './components/ImageUploader';

interface ImageData {
    imageId: string;
    originalUrl: string;
    processedUrl: string;
    originalName: string;
}

const API_URL = import.meta.env.VITE_API_URL || '';

export default function App() {
    const [imageData, setImageData] = useState<ImageData | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showOriginal, setShowOriginal] = useState(false);

    const handleUpload = useCallback(async (file: File) => {
        setIsUploading(true);
        setError(null);

        const originalUrl = URL.createObjectURL(file);
        const formData = new FormData();
        formData.append('image', file);

        try {
            const response = await fetch(`${API_URL}/api/upload`, {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to process image');
            }

            setImageData({
                imageId: data.imageId,
                originalUrl,
                processedUrl: data.processedUrl,
                originalName: file.name,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to upload image';
            setError(message);
            URL.revokeObjectURL(originalUrl);
        } finally {
            setIsUploading(false);
        }
    }, []);

    const handleBack = useCallback(() => {
        if (imageData) {
            URL.revokeObjectURL(imageData.originalUrl);
        }
        setImageData(null);
        setShowOriginal(false);
        setError(null);
    }, [imageData]);

    const handleDelete = useCallback(async () => {
        if (!imageData) return;

        try {
            await fetch(`${API_URL}/api/delete?imageId=${imageData.imageId}`, {
                method: 'DELETE',
            });
        } catch {
            // Ignore delete errors
        }

        handleBack();
    }, [imageData, handleBack]);

    const handleDownload = useCallback(() => {
        if (!imageData) return;
        // Use backend endpoint that sets Content-Disposition header
        const filename = encodeURIComponent(imageData.originalName);
        window.location.href = `${API_URL}/api/download/${imageData.imageId}?filename=${filename}`;
    }, [imageData]);

    const handleCopy = useCallback(async () => {
        if (!imageData) return;
        try {
            await navigator.clipboard.writeText(imageData.processedUrl);
        } catch {
            // Ignore copy errors
        }
    }, [imageData]);

    // Upload Screen
    if (!imageData && !isUploading) {
        return (
            <div className="app-container">
                <div className="upload-screen">
                    <h1 className="logo">Background Remover</h1>
                    <p className="tagline">Remove background & flip horizontally</p>
                    <ImageUploader onUpload={handleUpload} error={error} />
                </div>
            </div>
        );
    }

    // Loading Screen
    if (isUploading) {
        return (
            <div className="app-container">
                <div className="loading-screen">
                    <div className="spinner" />
                    <p>Processing...</p>
                </div>
            </div>
        );
    }

    // Result Screen
    return (
        <div className="app-container result-screen">
            {/* Top Bar */}
            <header className="top-bar">
                <button className="icon-btn back-btn" onClick={handleBack}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                    <span>Back</span>
                </button>

                <button
                    className={`icon-btn toggle-btn ${showOriginal ? 'active' : ''}`}
                    onMouseDown={() => setShowOriginal(true)}
                    onMouseUp={() => setShowOriginal(false)}
                    onMouseLeave={() => setShowOriginal(false)}
                    onTouchStart={() => setShowOriginal(true)}
                    onTouchEnd={() => setShowOriginal(false)}
                    title="Hold to view original"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                    </svg>
                </button>

                <div className="action-buttons">
                    <button className="icon-btn" onClick={handleCopy} title="Copy URL">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" />
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                        </svg>
                    </button>
                    <button className="icon-btn" onClick={handleDelete} title="Delete">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                    </button>
                    <button className="primary-btn" onClick={handleDownload}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                        </svg>
                        Download
                    </button>
                </div>
            </header>

            {/* Main Image */}
            <main className="image-view">
                <div className="image-wrapper">
                    <img
                        src={showOriginal ? imageData?.originalUrl : imageData?.processedUrl}
                        alt={showOriginal ? "Original" : "Processed"}
                    />
                </div>
            </main>

            {/* Bottom indicator */}
            <footer className="bottom-bar">
                <span className="image-label">
                    {showOriginal ? 'Original' : '✨ Background Removed & Flipped'}
                </span>
            </footer>
        </div>
    );
}
