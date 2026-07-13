import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  isTrustedRegistrationUploadReference,
  parsePublicMediaKey,
  parseRegistrationUploadKey,
  publicMediaUrl,
  registrationUploadReference,
} from './media-url';

const legacyCdn = 'https://storage.example.test';

describe('media URL boundaries', () => {
  it('returns only the controlled API route for public media', () => {
    expect(publicMediaUrl('posts/123_image.jpg')).toBe(
      '/api/v1/uploads/public/posts/123_image.jpg',
    );
    expect(
      parsePublicMediaKey('/api/v1/uploads/public/posts/123_image.jpg', 'posts', legacyCdn),
    ).toBe('posts/123_image.jpg');
    expect(publicMediaUrl('food/123_image.jpg')).toBe('/api/v1/uploads/public/food/123_image.jpg');
    expect(
      parsePublicMediaKey('/api/v1/uploads/public/food/123_image.jpg', 'food', legacyCdn),
    ).toBe('food/123_image.jpg');
  });

  it('rejects query strings, foreign paths, and path traversal attempts', () => {
    for (const value of [
      '/api/v1/uploads/public/posts/123_image.jpg?token=leak',
      '/api/v1/uploads/public/chatrooms/123_image.jpg',
      '/api/v1/uploads/public/posts/../registrations/proof.jpg',
      'https://attacker.example/posts/123_image.jpg',
    ]) {
      expect(() => parsePublicMediaKey(value, 'posts', legacyCdn)).toThrow(BadRequestException);
    }
  });

  it('accepts an exact legacy CDN URL only for backwards compatibility', () => {
    expect(
      parsePublicMediaKey('https://storage.example.test/posts/123_image.jpg', 'posts', legacyCdn),
    ).toBe('posts/123_image.jpg');
    expect(() =>
      parsePublicMediaKey('https://storage.example.test/posts/123_image.jpg#x', 'posts', legacyCdn),
    ).toThrow(BadRequestException);
  });

  it('uses opaque references for registration evidence', () => {
    const reference = registrationUploadReference('registrations/proof_123.png');
    expect(reference).toBe('upload://registrations/proof_123.png');
    expect(parseRegistrationUploadKey(reference, legacyCdn)).toBe('registrations/proof_123.png');
    expect(isTrustedRegistrationUploadReference(reference, legacyCdn)).toBe(true);
    expect(
      isTrustedRegistrationUploadReference(
        '/api/v1/uploads/public/registrations/proof_123.png',
        legacyCdn,
      ),
    ).toBe(false);
    expect(() =>
      parseRegistrationUploadKey('upload://registrations/../../proof.png', legacyCdn),
    ).toThrow(NotFoundException);
  });
});
