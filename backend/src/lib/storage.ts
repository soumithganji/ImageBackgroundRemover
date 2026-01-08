import { Storage } from '@google-cloud/storage';

// Initialize GCS client using Application Default Credentials (ADC)
// ADC automatically finds credentials from:
// 1. GOOGLE_APPLICATION_CREDENTIALS env var
// 2. gcloud CLI login (local dev)
// 3. Workload Identity Federation (Vercel/cloud)
// 4. Compute Engine/Cloud Run default service account
function getStorageClient(): Storage {
    const projectId = process.env.GCS_PROJECT_ID;

    if (!projectId) {
        throw new Error('GCS_PROJECT_ID environment variable is not set');
    }

    return new Storage({ projectId });
}

function getBucketName(): string {
    const bucketName = process.env.GCS_BUCKET_NAME;
    if (!bucketName) {
        throw new Error('GCS_BUCKET_NAME environment variable is not set');
    }
    return bucketName;
}

// Upload image to GCS
export async function uploadImage(
    imageBuffer: Buffer,
    fileName: string,
    contentType: string = 'image/png'
): Promise<string> {
    const storage = getStorageClient();
    const bucket = storage.bucket(getBucketName());
    const file = bucket.file(fileName);

    await file.save(imageBuffer, {
        metadata: {
            contentType,
        },
    });

    // Public access is controlled by bucket-level IAM policy (uniform bucket access)
    // Return public URL
    return `https://storage.googleapis.com/${getBucketName()}/${fileName}`;
}

// Delete image from GCS
export async function deleteImage(fileName: string): Promise<void> {
    const storage = getStorageClient();
    const bucket = storage.bucket(getBucketName());
    const file = bucket.file(fileName);

    try {
        await file.delete();
    } catch (error: unknown) {
        // Ignore if file doesn't exist
        if (error && typeof error === 'object' && 'code' in error && error.code !== 404) {
            throw error;
        }
    }
}

// Check if file exists
export async function fileExists(fileName: string): Promise<boolean> {
    const storage = getStorageClient();
    const bucket = storage.bucket(getBucketName());
    const file = bucket.file(fileName);

    const [exists] = await file.exists();
    return exists;
}

// Get public URL for a file
export function getPublicUrl(fileName: string): string {
    return `https://storage.googleapis.com/${getBucketName()}/${fileName}`;
}
