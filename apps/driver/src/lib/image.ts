// Downscale + re-encode a camera/gallery image to JPEG before upload. Mobile
// photos are 3–12 MB; drivers are on unreliable connections (PRD §22). Also
// normalises HEIC/other formats the browser can decode into a JPEG the server's
// sharp pipeline accepts. Falls back to the original file if any canvas step is
// unavailable (e.g. the test environment).
export async function compressImage(file: File, maxDim = 1600, quality = 0.85): Promise<Blob> {
  try {
    const bitmap = await loadBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob ?? file;
  } catch {
    return file;
  }
}

async function loadBitmap(file: File): Promise<{ width: number; height: number } & CanvasImageSource> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image decode failed'));
      el.src = url;
    });
    return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight });
  } finally {
    URL.revokeObjectURL(url);
  }
}
