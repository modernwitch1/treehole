import { BadRequestException, NotFoundException } from '@nestjs/common';

type PublicMediaFolder = 'posts' | 'chatrooms' | 'food';

const PUBLIC_MEDIA_PREFIX = '/api/v1/uploads/public/';
const FILE_NAME = '[A-Za-z0-9_-]+\\.(?:jpg|png)';

export function publicMediaUrl(key: string): string {
  if (!/^(posts|chatrooms|food)\/[A-Za-z0-9_-]+\.(?:jpg|png)$/.test(key)) {
    throw new Error('Invalid public media key');
  }
  return `${PUBLIC_MEDIA_PREFIX}${key}`;
}

export function registrationUploadReference(key: string): string {
  if (!new RegExp(`^registrations/${FILE_NAME}$`).test(key)) {
    throw new Error('Invalid registration upload key');
  }
  // Registration evidence is intentionally not a browser URL.  It can only be
  // read through the authenticated, audited admin screenshot endpoint.
  return `upload://${key}`;
}

export function parsePublicMediaKey(
  value: unknown,
  folder: PublicMediaFolder,
  legacyCdnBaseUrl: string,
): string {
  if (typeof value !== 'string' || value.length > 2048) {
    throw new BadRequestException('无效的图片地址');
  }

  const safeKey = new RegExp(`^${folder}/${FILE_NAME}$`);
  const controlledPath = `${PUBLIC_MEDIA_PREFIX}${folder}/`;
  if (value.startsWith(controlledPath)) {
    const key = value.slice(PUBLIC_MEDIA_PREFIX.length);
    if (safeKey.test(key) && !value.includes('?') && !value.includes('#')) {
      return key;
    }
  }

  // Existing posts may still contain the former CDN object URL.  Accept it only
  // when it exactly belongs to our configured legacy CDN, then rewrite output
  // to the controlled API route.  New writes never use this branch.
  try {
    const base = new URL(`${legacyCdnBaseUrl.replace(/\/+$/, '')}/`);
    const url = new URL(value);
    if (
      url.origin !== base.origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.startsWith(base.pathname)
    ) {
      throw new Error('untrusted URL');
    }
    const key = url.pathname.slice(base.pathname.length);
    if (!safeKey.test(key)) {
      throw new Error('untrusted key');
    }
    return key;
  } catch {
    throw new BadRequestException('无效的图片地址');
  }
}

export function parseRegistrationUploadKey(value: string, legacyCdnBaseUrl: string): string {
  const opaqueMatch = value.match(new RegExp(`^upload://(registrations/${FILE_NAME})$`));
  if (opaqueMatch) {
    return opaqueMatch[1];
  }

  try {
    const base = new URL(`${legacyCdnBaseUrl.replace(/\/+$/, '')}/`);
    const url = new URL(value);
    if (
      url.origin !== base.origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.startsWith(base.pathname)
    ) {
      throw new Error('untrusted URL');
    }
    const key = url.pathname.slice(base.pathname.length);
    if (!new RegExp(`^registrations/${FILE_NAME}$`).test(key)) {
      throw new Error('untrusted key');
    }
    return key;
  } catch {
    throw new NotFoundException('截图不存在');
  }
}

export function isTrustedRegistrationUploadReference(
  value: string | undefined,
  legacyCdnBaseUrl: string,
) {
  if (!value) {
    return false;
  }
  try {
    parseRegistrationUploadKey(value, legacyCdnBaseUrl);
    return true;
  } catch {
    return false;
  }
}
