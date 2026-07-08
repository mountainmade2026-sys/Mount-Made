const sharp = require('sharp');

const TARGET_BYTES = 200 * 1024;
const MAX_DIMENSION = 1600;
const COMPRESSIBLE_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function normalizeMimeType(mimetype) {
  return String(mimetype || '').toLowerCase();
}

function isCompressibleImage(mimetype) {
  return COMPRESSIBLE_MIME_TYPES.has(normalizeMimeType(mimetype));
}

function getOutputMimeType(mimetype, metadata) {
  const normalized = normalizeMimeType(mimetype);
  if (normalized === 'image/png' && metadata?.hasAlpha) {
    return 'image/png';
  }
  if (normalized === 'image/webp') {
    return 'image/webp';
  }
  return 'image/jpeg';
}

async function compressImageBuffer(buffer, mimetype, originalName = 'image') {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return { buffer, mimetype, changed: false };
  }

  const normalizedMime = normalizeMimeType(mimetype);
  const originalSize = Buffer.byteLength(buffer);
  if (!isCompressibleImage(normalizedMime) || originalSize <= TARGET_BYTES) {
    return { buffer, mimetype: normalizedMime, changed: false };
  }

  try {
    const image = sharp(buffer);
    const metadata = await image.metadata();
    const width = metadata?.width || 0;
    const height = metadata?.height || 0;
    const maxDimension = Math.max(900, Math.min(MAX_DIMENSION, Math.max(width, height) || MAX_DIMENSION));
    const shouldResize = Boolean(width && height && (width > maxDimension || height > maxDimension));

    const pipeline = sharp(buffer).rotate();
    const candidateDimensions = shouldResize
      ? [maxDimension, Math.max(1200, Math.floor(maxDimension * 0.85)), 1000, 900]
      : [maxDimension];
    const candidateQualities = [82, 76, 70, 64, 58, 52];

    let finalBuffer = buffer;
    let finalMime = normalizedMime;
    let finalChanged = false;

    for (const dimension of candidateDimensions) {
      for (const quality of candidateQualities) {
        let pipelineCopy = pipeline.clone();
        if (shouldResize && (width > dimension || height > dimension)) {
          pipelineCopy = pipelineCopy.resize({
            width: dimension,
            height: dimension,
            fit: 'inside',
            withoutEnlargement: true
          });
        }

        const outputMime = getOutputMimeType(normalizedMime, metadata);
        let nextBuffer;
        if (outputMime === 'image/jpeg') {
          nextBuffer = await pipelineCopy.jpeg({ quality, progressive: true, mozjpeg: true }).toBuffer();
        } else if (outputMime === 'image/webp') {
          nextBuffer = await pipelineCopy.webp({ quality, effort: 6 }).toBuffer();
        } else {
          nextBuffer = await pipelineCopy.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
        }

        const nextSize = Buffer.byteLength(nextBuffer);
        finalBuffer = nextBuffer;
        finalMime = outputMime;
        finalChanged = nextSize < originalSize;

        if (nextSize <= TARGET_BYTES) {
          return { buffer: finalBuffer, mimetype: finalMime, changed: finalChanged, originalName };
        }
      }
    }

    return { buffer: finalBuffer, mimetype: finalMime, changed: finalChanged, originalName };
  } catch (error) {
    console.warn('Image compression skipped:', error?.message || error);
    return { buffer, mimetype: normalizedMime, changed: false };
  }
}

module.exports = {
  TARGET_BYTES,
  compressImageBuffer,
  isCompressibleImage
};
