import { Storage } from '@google-cloud/storage';

function getStorageClient(): Storage {
    const projectId = process.env.GCS_PROJECT_ID;

    if (!projectId) {
        throw new Error('GCS_PROJECT_ID environment variable is not set');
    }

    // Support for Workload Identity Federation via Env Var
    // Vercel doesn't filesystem persistent, so we pass the JSON config as an Env Var
    const googleCredentials = process.env.GOOGLE_CREDENTIALS;
    if (googleCredentials) {
        try {
            const credentials = JSON.parse(googleCredentials);
            console.log('✓ Found GOOGLE_CREDENTIALS, using for auth');
            return new Storage({
                projectId,
                credentials,
            });
        } catch (error) {
            console.error('❌ Failed to parse GOOGLE_CREDENTIALS:', error);
        }
    }

    // Fallback to ADC (standard lookup)
    // The library will automatically look for GOOGLE_APPLICATION_CREDENTIALS
    // or other standard authentication methods.
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

// Get public URL
export function getPublicUrl(fileName: string): string {
    return `https://storage.googleapis.com/${getBucketName()}/${fileName}`;
}
