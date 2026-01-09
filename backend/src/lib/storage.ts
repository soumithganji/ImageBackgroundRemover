import { Storage } from '@google-cloud/storage';
import { OAuth2Client } from 'google-auth-library';

// Check if running in Vercel serverless environment
function isVercelEnvironment(): boolean {
    return !!process.env.VERCEL;
}

async function exchangeOidcTokenForGcpToken(
    oidcToken: string,
    workloadIdentityProvider: string,
    serviceAccountEmail: string
): Promise<string> {
    // Step 1: Exchange Vercel OIDC token for GCP STS token
    const stsResponse = await fetch('https://sts.googleapis.com/v1/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
            audience: `//iam.googleapis.com/${workloadIdentityProvider}`,
            scope: 'https://www.googleapis.com/auth/cloud-platform',
            requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
            subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
            subject_token: oidcToken,
        }),
    });

    if (!stsResponse.ok) {
        const error = await stsResponse.text();
        throw new Error(`STS token exchange failed: ${error}`);
    }

    const stsResult = await stsResponse.json() as { access_token: string };
    const federatedToken = stsResult.access_token;

    // Step 2: Use federated token to impersonate service account
    const impersonateResponse = await fetch(
        `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${federatedToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                scope: ['https://www.googleapis.com/auth/cloud-platform'],
            }),
        }
    );

    if (!impersonateResponse.ok) {
        const error = await impersonateResponse.text();
        throw new Error(`Service account impersonation failed: ${error}`);
    }

    const impersonateResult = await impersonateResponse.json() as { accessToken: string };
    return impersonateResult.accessToken;
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

        // Get Vercel OIDC token
        const { getVercelOidcToken } = await import('@vercel/oidc');
        const oidcToken = await getVercelOidcToken();
        console.log('✓ Got Vercel OIDC token');

        // Exchange for GCP access token
        const accessToken = await exchangeOidcTokenForGcpToken(
            oidcToken,
            workloadIdentityProvider,
            serviceAccountEmail
        );
        console.log('✓ Got GCP access token via WIF');

        // Create an OAuth2Client with the access token
        const oauth2Client = new OAuth2Client();
        oauth2Client.setCredentials({
            access_token: accessToken,
        });

        // Create Storage client with the OAuth2 client
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new Storage({
            projectId,
            authClient: oauth2Client as any,
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
