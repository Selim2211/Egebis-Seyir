/**
 * Seçilen resmi ortadan kare kırpıp 256 px'e küçültür (ADR-059). WebP desteklenmiyorsa PNG üretir.
 * Küçültme sunucuya giden boyutu da düşürür; sunucu yine de içeriği doğrular.
 */
export async function squareAvatar(file: File, size = 256): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas');
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.9),
    );
    if (blob?.type === 'image/webp') return blob;
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('canvas');
    return png;
  } finally {
    bitmap.close();
  }
}
