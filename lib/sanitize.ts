/**
 * Sanitize markdown content to prevent XSS.
 * Strips dangerous HTML tags while preserving markdown formatting.
 * Note: for AI-generated content (trusted source), this is defense-in-depth.
 * The primary XSS protection is ReactMarkdown's disallowedElements config.
 */
export function sanitizeMarkdown(content: string): string {
  if (!content) return '';

  return content
    // Remove script tags and their contents
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove style tags and their contents
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Remove dangerous elements (iframe, object, embed, applet, form, meta, link)
    .replace(/<(iframe|object|embed|applet|form|meta|link)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*/gi, '')
    // Remove event handler attributes (onerror, onclick, onload, etc.)
    .replace(/\s(on\w+)\s*=/gi, ' data-removed-$1=')
    // Remove javascript: / data: URLs in href/src
    .replace(/\b(href|src)\s*=\s*["']?\s*(javascript:|data:)/gi, '$1="removed:"')
    // Remove style attributes with expressions (IE XSS vector)
    .replace(/\sstyle\s*=/gi, ' data-removed-style=');
}

/**
 * Strip LLM chain-of-thought blocks (think / thinking) from generated output.
 * Anchored on the opening tag so a stray closing tag in the middle of the
 * report never swallows the preceding content.
 */
export function stripThinkTags(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .trim();
}

/**
 * Strip all HTML tags completely (no markdown, just text)
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}