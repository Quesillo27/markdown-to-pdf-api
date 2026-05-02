'use strict';

const express = require('express');
const { markdownToHtml, analyzeMarkdown } = require('./markdownParser');
const { generatePdf, THEMES } = require('./pdfGenerator');

const app = express();
const PORT = process.env.PORT || 3000;
const VALID_THEMES = Object.keys(THEMES);
const APP_VERSION = '1.1.2';
const MAX_MARKDOWN_LENGTH = 500_000;

// Middleware
app.use(express.json({ limit: '2mb' }));
app.use(express.text({ type: 'text/markdown', limit: '2mb' }));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  return next(err);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: APP_VERSION, themes: VALID_THEMES });
});

// List available themes
app.get('/themes', (req, res) => {
  res.json({ themes: VALID_THEMES });
});

/**
 * POST /convert
 * Body: { markdown: string, options?: { theme, title, author, format } }
 * OR raw text/markdown body
 * Query params: format=pdf|html|text, theme=default|dark|github|minimal
 */
app.post('/convert', async (req, res) => {
  try {
    const validationResult = validateMarkdownRequest(req.body, {
      hint: 'Send JSON { markdown: "..." } or Content-Type: text/markdown',
    });
    if (validationResult.status) {
      return res.status(validationResult.status).json(validationResult.body);
    }

    const markdown = validationResult.markdown;

    // Determine options
    const options = (req.body && req.body.options) || {};
    const format = options.format || req.query.format || 'pdf';
    const theme = options.theme || req.query.theme || 'default';

    if (!['pdf', 'html', 'text'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format. Use: pdf, html, text' });
    }
    if (!VALID_THEMES.includes(theme)) {
      return res.status(400).json({ error: `Invalid theme. Use: ${VALID_THEMES.join(', ')}` });
    }

    if (format === 'html') {
      const html = markdownToHtml(markdown);
      return res.type('html').send(wrapHtml(html, theme, options.title));
    }

    if (format === 'text') {
      const { markdownToText } = require('./markdownParser');
      return res.type('text/plain').send(markdownToText(markdown));
    }

    // PDF format
    const pdfBuffer = await generatePdf(markdown, {
      theme,
      title: options.title || 'Document',
      author: options.author || 'markdown-to-pdf-api',
    });

    const downloadFilename = sanitizeDownloadFilename(options.filename);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${downloadFilename}"`,
      'Content-Length': pdfBuffer.length,
    });
    return res.send(pdfBuffer);

  } catch (err) {
    console.error('Convert error:', err.message);
    return res.status(500).json({ error: 'Conversion failed', detail: err.message });
  }
});

/**
 * POST /analyze
 * Analyze markdown and return stats without converting
 */
app.post('/analyze', (req, res) => {
  try {
    const validationResult = validateMarkdownRequest(req.body);
    if (validationResult.status) {
      return res.status(validationResult.status).json(validationResult.body);
    }

    const stats = analyzeMarkdown(validationResult.markdown);
    return res.json({ stats });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    endpoints: ['GET /health', 'GET /themes', 'POST /convert', 'POST /analyze'],
  });
});

function wrapHtml(content, theme, title) {
  const themes = {
    default: 'body{font-family:Georgia,serif;max-width:800px;margin:0 auto;padding:2em;color:#333;line-height:1.6}h1,h2,h3{color:#1a1a2e}code{background:#f4f4f4;padding:2px 6px;border-radius:3px}pre{background:#f4f4f4;padding:1em;overflow-x:auto}blockquote{border-left:4px solid #ccc;margin:0;padding-left:1em;color:#555}',
    dark: 'body{font-family:Georgia,serif;max-width:800px;margin:0 auto;padding:2em;color:#d0d0d0;background:#1e1e1e;line-height:1.6}h1,h2,h3{color:#87ceeb}code{background:#2d2d2d;padding:2px 6px;border-radius:3px;color:#98fb98}pre{background:#2d2d2d;padding:1em;overflow-x:auto}blockquote{border-left:4px solid #555;margin:0;padding-left:1em;color:#a0a0a0}',
    github: 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;max-width:800px;margin:0 auto;padding:2em;color:#24292e;line-height:1.5}h1{border-bottom:1px solid #e1e4e8;padding-bottom:.3em}code{background:#f6f8fa;padding:2px 6px;border-radius:3px}pre{background:#f6f8fa;padding:1em;overflow-x:auto}blockquote{border-left:4px solid #d1d5da;margin:0;padding-left:1em;color:#6a737d}',
    minimal: 'body{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;max-width:700px;margin:0 auto;padding:3em;color:#444;line-height:1.7}h1,h2,h3{font-weight:300}code{font-family:monospace;background:#f9f9f9;padding:2px 5px}pre{background:#f9f9f9;padding:1em;overflow-x:auto}blockquote{border-left:2px solid #ddd;margin:0;padding-left:1em;color:#777}',
  };
  const css = themes[theme] || themes.default;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title || 'Document')}</title><style>${css}</style></head><body>${content}</body></html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeDownloadFilename(filename) {
  if (typeof filename !== 'string') {
    return 'document.pdf';
  }

  const cleaned = filename
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/[\\/]/g, '-')
    .replace(/["';]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return 'document.pdf';
  }

  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
}

function getMarkdownFromBody(body) {
  if (typeof body === 'string') {
    return body;
  }

  if (body && typeof body.markdown === 'string') {
    return body.markdown;
  }

  return null;
}

function validateMarkdownRequest(body, options = {}) {
  const markdown = getMarkdownFromBody(body);
  if (markdown === null) {
    return {
      status: 400,
      body: {
        error: 'Missing markdown content',
        ...(options.hint ? { hint: options.hint } : {}),
      },
    };
  }

  if (markdown.trim().length === 0) {
    return { status: 400, body: { error: 'Markdown content is empty' } };
  }

  if (markdown.length > MAX_MARKDOWN_LENGTH) {
    return { status: 413, body: { error: 'Markdown content too large (max 500KB)' } };
  }

  return { markdown };
}

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`markdown-to-pdf-api running on port ${PORT}`);
    console.log(`Themes available: ${VALID_THEMES.join(', ')}`);
  });
}

module.exports = app;
