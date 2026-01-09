import { Storage } from '@google-cloud/storage';
import { GoogleAuth } from 'google-auth-library';

// Cache the storage instance
let storageInstance: Storage | null = null;

async function getStorageClient(): Promise<Storage> {
    if (storageInstance) return storageInstance;

    const projectId = process.env.GCS_PROJECT_ID;

    if (!projectId) {
        throw new Error('GCS_PROJECT_ID environment variable is not set');
    }

    // Support for Workload Identity Federation via Env Var
    const googleCredentials = process.env.GOOGLE_CREDENTIALS;
    if (googleCredentials) {
        try {
            console.log('✓ Found GOOGLE_CREDENTIALS, initializing GoogleAuth...');
            const credentials = JSON.parse(googleCredentials);

            const auth = new GoogleAuth({
                credentials,
                projectId,
                scopes: 'https://www.googleapis.com/auth/cloud-platform',
            });

            const authClient = await auth.getClient();
            console.log('✓ Auth client created successfully');

            storageInstance = new Storage({
                projectId,
                authClient: authClient as any, // Type compatibility
            });
            return storageInstance;
        } catch (error) {
            console.error('❌ Failed to initialize with GOOGLE_CREDENTIALS:', error);
        }
    }

    console.log('⚠️ Falling back to default credentials (ADC)...');
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
