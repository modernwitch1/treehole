import MarkdownIt from 'markdown-it';

/**
 * Render user-authored Markdown without raw HTML and mark every link as
 * untrusted user-generated content. This prevents opener access and avoids
 * turning spam links into search-ranking endorsements.
 */
export function createSafeMarkdownRenderer() {
  const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true });
  const fallback = markdown.renderer.rules.link_open;
  markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
    tokens[index].attrSet('target', '_blank');
    tokens[index].attrSet('rel', 'nofollow ugc noopener noreferrer');
    return fallback
      ? fallback(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options);
  };
  return markdown;
}
