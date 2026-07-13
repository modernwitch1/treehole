export function imageUrlsForPostContent(contentMd: string): string[] {
  return [...contentMd.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)].map((match) => publicImageUrl(match[1]));
}

export function normalizePostMedia(content: string): string {
  return content.replace(
    /https?:\/\/[^\s"')]+\/(posts|registrations|chatrooms)\/([A-Za-z0-9_-]+\.(?:jpg|png))/g,
    (_match, folder: string, filename: string) =>
      '/api/v1/uploads/public/' + folder + '/' + filename,
  );
}

function publicImageUrl(value: string): string {
  const match = value.match(
    /\/(posts|registrations|chatrooms)\/([A-Za-z0-9_-]+\.(?:jpg|png))(?:[?#].*)?$/,
  );
  return match ? '/api/v1/uploads/public/' + match[1] + '/' + match[2] : value;
}
