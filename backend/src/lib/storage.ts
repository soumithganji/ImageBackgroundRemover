// Check if running in Vercel serverless environment
function isVercelEnvironment(): boolean {
    return !!process.env.VERCEL;
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getGcpAccessToken(): Promise<string> {
    // Return cached token if still valid (with 5 min buffer)
    if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 300000) {
        return cachedAccessToken.token;
    }

    const serviceAccountEmail = process.env.GCS_SERVICE_ACCOUNT_EMAIL!;
    const workloadIdentityProvider = process.env.GCS_WORKLOAD_IDENTITY_POOL_PROVIDER!;

    // Get Vercel OIDC token
    const { getVercelOidcToken } = await import('@vercel/oidc');
    const oidcToken = await getVercelOidcToken();
    console.log('✓ Got Vercel OIDC token');

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
    console.log('✓ Got STS federated token');

    // Step 2: Impersonate service account
    const impersonateResponse = await fetch(
        `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${stsResult.access_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                scope: ['https://www.googleapis.com/auth/devstorage.full_control'],
            }),
        }
    );

    if (!impersonateResponse.ok) {
        const error = await impersonateResponse.text();
        throw new Error(`Service account impersonation failed: ${error}`);
    }

    const impersonateResult = await impersonateResponse.json() as { accessToken: string; expireTime: string };
    console.log('✓ Got GCP access token via WIF');

    // Cache the token
    cachedAccessToken = {
        token: impersonateResult.accessToken,
        expiresAt: new Date(impersonateResult.expireTime).getTime(),
    };

    return impersonateResult.accessToken;
}

function getBucketName(): string {
    const bucketName = process.env.GCS_BUCKET_NAME;
    if (!bucketName) {
        throw new Error('GCS_BUCKET_NAME environment variable is not set');
    }
    return bucketName;
}

// Upload image to GCS using direct API call
export async function uploadImage(
    imageBuffer: Buffer,
    fileName: string,
    contentType: string = 'image/png'
): Promise<string> {
    const bucketName = getBucketName();

    if (isVercelEnvironment()) {
        // Use direct GCS JSON API
        const accessToken = await getGcpAccessToken();

        const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${bucketName}/o?uploadType=media&name=${encodeURIComponent(fileName)}`;

        const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': contentType,
            },
            body: imageBuffer,
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`GCS upload failed: ${error}`);
        }

        console.log('✓ Uploaded to GCS via direct API');
        return `https://storage.googleapis.com/${bucketName}/${fileName}`;
    } else {
        // Local development: use Storage library with ADC
        const { Storage } = await import('@google-cloud/storage');
        const storage = new Storage({ projectId: process.env.GCS_PROJECT_ID });
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(fileName);

        await file.save(imageBuffer, {
            metadata: { contentType },
        });

        return `https://storage.googleapis.com/${bucketName}/${fileName}`;
    }
}

// Delete image from GCS
export async function deleteImage(fileName: string): Promise<void> {
    const bucketName = getBucketName();

    if (isVercelEnvironment()) {
        const accessToken = await getGcpAccessToken();
        const deleteUrl = `https://storage.googleapis.com/storage/v1/b/${bucketName}/o/${encodeURIComponent(fileName)}`;

        const response = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        // 404 is ok - file doesn't exist
        if (!response.ok && response.status !== 404) {
            const error = await response.text();
            throw new Error(`GCS delete failed: ${error}`);
        }
    } else {
        const { Storage } = await import('@google-cloud/storage');
        const storage = new Storage({ projectId: process.env.GCS_PROJECT_ID });
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(fileName);

        try {
            await file.delete();
        } catch (error: unknown) {
            if (error && typeof error === 'object' && 'code' in error && error.code !== 404) {
                throw error;
            }
        }
    }
}

// Check if file exists
export async function fileExists(fileName: string): Promise<boolean> {
    const bucketName = getBucketName();

    if (isVercelEnvironment()) {
        const accessToken = await getGcpAccessToken();
        const metadataUrl = `https://storage.googleapis.com/storage/v1/b/${bucketName}/o/${encodeURIComponent(fileName)}`;

        const response = await fetch(metadataUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        return response.ok;
    } else {
        const { Storage } = await import('@google-cloud/storage');
        const storage = new Storage({ projectId: process.env.GCS_PROJECT_ID });
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(fileName);
        const [exists] = await file.exists();
        return exists;
    }
}

// Get public URL
export function getPublicUrl(fileName: string): string {
    return `https://storage.googleapis.com/${getBucketName()}/${fileName}`;
}
