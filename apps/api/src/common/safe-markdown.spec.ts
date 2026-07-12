import { createSafeMarkdownRenderer } from './safe-markdown';

describe('createSafeMarkdownRenderer', () => {
  it('escapes raw HTML and hardens user-authored links', () => {
    const html = createSafeMarkdownRenderer().render(
      '<script>alert(1)</script> [校园链接](https://example.com)',
    );

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="nofollow ugc noopener noreferrer"');
  });

  it('does not emit javascript links', () => {
    const html = createSafeMarkdownRenderer().render('[点击](javascript:alert(1))');

    expect(html).not.toContain('href="javascript:');
  });
});
