/*
 * Receipt photos and screenshots: shrunk on the phone before they are stored or sent to the AI.
 * A phone photo of 3–5 MB becomes a JPEG of roughly 150–400 KB that is still easy to read.
 */

const MAX_SIDE = 2400; // long, narrow receipts keep enough height to stay readable
const MAX_PIXELS = 2_400_000;
const QUALITY = 0.8;

/** How big the shrunk image will be: never upscaled, within both limits. */
export const fitSize = (w, h, { maxSide = MAX_SIDE, maxPixels = MAX_PIXELS } = {}) => {
  const scale = Math.min(1, maxSide / Math.max(w, h), Math.sqrt(maxPixels / (w * h)));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
};

const loadImage = async (file) => {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall back to <img> (older Safari, some formats) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** A picked file → { blob (JPEG), width, height }. Throws when the file isn't an image the browser can open. */
export const prepareImage = async (file) => {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('not-image');
  const img = await loadImage(file);
  const w = img.width || img.naturalWidth;
  const h = img.height || img.naturalHeight;
  if (!w || !h) throw new Error('not-image');
  const { width, height } = fitSize(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // transparent screenshots → white, not black
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  img.close?.();
  const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', QUALITY));
  return { blob, width, height };
};

export const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

export const dataUrlToBlob = (dataUrl) => {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl || '');
  if (!m) return null;
  const type = m[1] || 'application/octet-stream';
  const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
};
