import sharp from 'sharp';

// Convert any image to PNG 
export async function convertToPng(imageBuffer: Buffer): Promise<Buffer> {
    return sharp(imageBuffer)
        .png()
        .toBuffer();
}

// Horizontally flip an image
export async function flipImageHorizontally(imageBuffer: Buffer): Promise<Buffer> {
    return sharp(imageBuffer)
        .flop() // flop = horizontal flip, flip = vertical flip
        .png()
        .toBuffer();
}

// Get image metadata
export async function getImageMetadata(imageBuffer: Buffer) {
    return sharp(imageBuffer).metadata();
}
