/**
 * Sanitize markdown content to prevent XSS.
 * Strips HTML tags (including script, img onerror, style onload, etc.)
 * while preserving markdown formatting.
 */

export function sanitizeMarkdown(content: string): string {
  if (!content) return '';

  return content
    // Remove script tags and their contents
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove style tags and their contents
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Remove event handlers (onclick, onerror, onload, onmouseover, etc.)
    .replace(/\s(on\w+)\s*=/gi, ' data-removed-$1=')
    // Remove javascript: URLs
    .replace(/javascript:/gi, '')
    // Remove data: URLs (can be used for base64 exploits)
    .replace(/data:/gi, '')
    // Remove iframes
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    // Remove object/embed/applet
    .replace(/<(object|embed|applet)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, '')
    // Remove form tags
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '')
    // Remove meta refresh
    .replace(/<meta[^>]*>/gi, '')
    // Remove link tags (could load external CSS)
    .replace(/<link[^>]*>/gi, '')
    // Clean up any remaining angle brackets (basic XSS attempt)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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