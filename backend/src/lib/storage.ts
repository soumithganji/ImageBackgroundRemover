import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Cache the storage instance
let storageInstance: Storage | null = null;

async function getStorageClient(): Promise<Storage> {
    if (storageInstance) return storageInstance;

    const projectId = process.env.GCS_PROJECT_ID;

    if (!projectId) {
        throw new Error('GCS_PROJECT_ID environment variable is not set');
    }

    // Workload Identity / Credentials Strategy for Vercel:
    // 1. Read JSON from Env Var
    // 2. Write to /tmp file
    // 3. Pass keyFilename explicitly to Storage constructor
    const googleCredentials = process.env.GOOGLE_CREDENTIALS;
    if (googleCredentials) {
        try {
            const tmpDir = os.tmpdir();
            const keyFilePath = path.join(tmpDir, 'gcp-credentials.json');

            // Only write if not already there or to overwrite potential stale data
            fs.writeFileSync(keyFilePath, googleCredentials);
            console.log(`✓ Wrote credentials to ${keyFilePath}`);

            storageInstance = new Storage({
                projectId,
                keyFilename: keyFilePath
            });
            return storageInstance;

        } catch (error) {
            console.error('❌ Failed to write credentials file:', error);
        }
    } else {
        console.log('⚠️ GOOGLE_CREDENTIALS env var not found, relying on default environment setup...');
    }

    // Fallback standard initialization (ADC)
    storageInstance = new Storage({ projectId });
    return storageInstance;
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
    const storage = await getStorageClient();
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
    const storage = await getStorageClient();
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
    const storage = await getStorageClient();
    const bucket = storage.bucket(getBucketName());
    const file = bucket.file(fileName);

    const [exists] = await file.exists();
    return exists;
}

// Get public URL
export function getPublicUrl(fileName: string): string {
    return `https://storage.googleapis.com/${getBucketName()}/${fileName}`;
}
