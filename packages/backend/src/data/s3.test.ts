import { describe, it, expect } from 'vitest';
import { uploadImage, getImageUrl, deleteImage } from './s3.js';

describe('S3 operations (requires LocalStack)', () => {
  const testKey = 'test-checklist/0-0-0/test-image.png';
  const testBuffer = Buffer.from('fake-png-data');

  it('uploads an image and returns the key', async () => {
    const key = await uploadImage(testKey, testBuffer, 'image/png');
    expect(key).toBe(testKey);
  });

  it('generates a presigned URL for the image', async () => {
    const url = await getImageUrl(testKey);
    expect(url).toContain('checklist-images');
    expect(url).toContain('test-image.png');
  });

  it('deletes an image', async () => {
    await deleteImage(testKey);
    const url = await getImageUrl(testKey);
    expect(url).toBeDefined();
  });
});
