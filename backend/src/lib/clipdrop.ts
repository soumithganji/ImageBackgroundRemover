// Clipdrop API integration
export async function removeBackground(imageBuffer: Buffer): Promise<Buffer> {
    const apiKey = process.env.CLIPDROP_API_KEY;

    if (!apiKey) {
        throw new Error('CLIPDROP_API_KEY environment variable is not set');
    }

    const formData = new FormData();
    formData.append('image_file', new Blob([new Uint8Array(imageBuffer)]), 'image.png');

    const response = await fetch('https://clipdrop-api.co/remove-background/v1', {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
        },
        body: formData,
    });

    if (!response.ok) {
        let errorMessage = 'Failed to remove background';
        try {
            const errorJson = await response.json() as { error?: string };
            errorMessage = errorJson.error || errorMessage;
        } catch {
            const errorText = await response.text();
            if (errorText) errorMessage = errorText;
        }

        if (response.status === 401) {
            throw new Error('Invalid API Key. Please check your CLIPDROP_API_KEY.');
        } else if (response.status === 402) {
            throw new Error('Insufficient credits. Please upgrade your Clipdrop plan.');
        } else if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please try again later.');
        } else if (response.status >= 500) {
            throw new Error('Clipdrop service is currently unavailable. Please try again later.');
        }

        throw new Error(`Clipdrop API Error: ${errorMessage}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
