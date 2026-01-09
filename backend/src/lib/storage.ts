import { Storage } from '@google-cloud/storage';
import { IdentityPoolClient } from 'google-auth-library';

// Check if running in Vercel serverless environment
function isVercelEnvironment(): boolean {
    return !!process.env.VERCEL;
}

async function getStorageClient(): Promise<Storage> {
    const projectId = process.env.GCS_PROJECT_ID;

    if (!projectId) {
        throw new Error('GCS_PROJECT_ID environment variable is not set');
    }

    // Workload Identity Federation for Vercel
    if (isVercelEnvironment()) {
        const serviceAccountEmail = process.env.GCS_SERVICE_ACCOUNT_EMAIL;
        const workloadIdentityProvider = process.env.GCS_WORKLOAD_IDENTITY_POOL_PROVIDER;

        if (!serviceAccountEmail || !workloadIdentityProvider) {
            throw new Error(
                'Missing WIF config: GCS_SERVICE_ACCOUNT_EMAIL and GCS_WORKLOAD_IDENTITY_POOL_PROVIDER are required in Vercel'
            );
        }

        // Dynamically import @vercel/oidc to avoid issues in local dev
        const { getVercelOidcToken } = await import('@vercel/oidc');

        // Create IdentityPoolClient with subject token supplier
        const authClient = new IdentityPoolClient({
            type: 'external_account',
            audience: `//iam.googleapis.com/${workloadIdentityProvider}`,
            subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
            token_url: 'https://sts.googleapis.com/v1/token',
            service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
            subject_token_supplier: {
                getSubjectToken: async () => {
                    const token = await getVercelOidcToken();
                    console.log('✓ Got Vercel OIDC token');
                    return token;
                },
            },
        });

        console.log('✓ Initialized GCS with Workload Identity Federation');

        return new Storage({
            projectId,
            authClient: authClient as any,
        });
    }

    // Local development: use Application Default Credentials (ADC)
    console.log('⚡ Using Application Default Credentials (local dev)');
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
