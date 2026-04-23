'use strict';

const request = require('supertest');
const app = require('../src/server');
const { markdownToHtml, markdownToText, analyzeMarkdown } = require('../src/markdownParser');

// Sample markdown for tests
const SAMPLE_MD = `# Hello World

This is a **bold** paragraph with *italic* text.

## Code Example

\`\`\`javascript
const x = 42;
console.log(x);
\`\`\`

- Item one
- Item two
- Item three

> A blockquote here

---

[Link text](https://example.com)
`;

// ── markdownParser unit tests ───────────────────────────────────────────────

describe('markdownParser', () => {
  test('markdownToHtml returns non-empty string', () => {
    const html = markdownToHtml(SAMPLE_MD);
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain('<h1');
    expect(html).toContain('<strong>');
  });

  test('markdownToHtml throws on non-string input', () => {
    expect(() => markdownToHtml(123)).toThrow(TypeError);
    expect(() => markdownToHtml(null)).toThrow(TypeError);
  });

  test('markdownToHtml sanitizes dangerous content', () => {
    const xss = '# Title\n<script>alert(1)</script>';
    const html = markdownToHtml(xss);
    expect(html).not.toContain('<script>');
  });

  test('markdownToText strips markdown syntax', () => {
    const text = markdownToText('# Heading\n**bold** and *italic*');
    expect(text).not.toContain('#');
    expect(text).not.toContain('**');
    expect(text).toContain('bold');
  });

  test('analyzeMarkdown returns correct stats', () => {
    const stats = analyzeMarkdown(SAMPLE_MD);
    expect(stats.wordCount).toBeGreaterThan(0);
    expect(stats.headingCount).toBeGreaterThanOrEqual(2);
    expect(stats.codeBlockCount).toBeGreaterThanOrEqual(1);
    expect(stats.linkCount).toBeGreaterThanOrEqual(1);
    expect(stats.estimatedReadTime).toBeGreaterThanOrEqual(1);
  });

  test('analyzeMarkdown throws on non-string', () => {
    expect(() => analyzeMarkdown({})).toThrow(TypeError);
  });
});

// ── API endpoint tests ───────────────────────────────────────────────────────

describe('GET /health', () => {
  test('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(Array.isArray(res.body.themes)).toBe(true);
  });
});

describe('GET /themes', () => {
  test('returns list of available themes', async () => {
    const res = await request(app).get('/themes');
    expect(res.status).toBe(200);
    expect(res.body.themes).toContain('default');
    expect(res.body.themes).toContain('dark');
    expect(res.body.themes).toContain('github');
    expect(res.body.themes).toContain('minimal');
  });
});

describe('POST /analyze', () => {
  test('returns stats for valid markdown', async () => {
    const res = await request(app)
      .post('/analyze')
      .send({ markdown: SAMPLE_MD });
    expect(res.status).toBe(200);
    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.wordCount).toBeGreaterThan(0);
  });

  test('returns 400 for missing markdown', async () => {
    const res = await request(app)
      .post('/analyze')
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /convert — HTML format', () => {
  test('returns HTML for default format query', async () => {
    const res = await request(app)
      .post('/convert?format=html')
      .send({ markdown: SAMPLE_MD });
    expect(res.status).toBe(200);
    expect(res.type).toMatch(/html/);
    expect(res.text).toContain('<h1');
  });

  test('returns HTML with dark theme', async () => {
    const res = await request(app)
      .post('/convert?format=html&theme=dark')
      .send({ markdown: '# Dark' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('1e1e1e');
  });

  test('returns HTML with github theme', async () => {
    const res = await request(app)
      .post('/convert?format=html&theme=github')
      .send({ markdown: '# GitHub style' });
    expect(res.status).toBe(200);
    expect(res.type).toMatch(/html/);
  });

  test('accepts markdown in options object', async () => {
    const res = await request(app)
      .post('/convert')
      .send({ markdown: '# Test', options: { format: 'html', theme: 'minimal' } });
    expect(res.status).toBe(200);
    expect(res.type).toMatch(/html/);
  });

  test('escapes the HTML title before rendering', async () => {
    const res = await request(app)
      .post('/convert?format=html')
      .send({ markdown: '# Safe', options: { title: '<script>alert(1)</script>' } });
    expect(res.status).toBe(200);
    expect(res.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(res.text).not.toContain('<title><script>alert(1)</script></title>');
  });
});

describe('POST /convert — text format', () => {
  test('returns plain text', async () => {
    const res = await request(app)
      .post('/convert?format=text')
      .send({ markdown: '# Title\nSome text' });
    expect(res.status).toBe(200);
    expect(res.type).toMatch(/text/);
    expect(res.text).toContain('Title');
    expect(res.text).toContain('Some text');
  });
});

describe('POST /convert — PDF format', () => {
  test('returns PDF buffer', async () => {
    const res = await request(app)
      .post('/convert')
      .send({ markdown: SAMPLE_MD });
    expect(res.status).toBe(200);
    expect(res.type).toMatch(/pdf/);
    expect(res.body).toBeDefined();
    // PDF starts with %PDF
    expect(res.headers['content-type']).toMatch(/pdf/);
  }, 15000);

  test('returns PDF with dark theme', async () => {
    const res = await request(app)
      .post('/convert')
      .send({ markdown: '# Dark Title', options: { theme: 'dark' } });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf/);
  }, 15000);

  test('sanitizes the download filename and preserves pdf extension', async () => {
    const res = await request(app)
      .post('/convert')
      .send({ markdown: '# Report', options: { filename: 'quarterly\nreport' } });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('filename="quarterly report.pdf"');
  }, 15000);
});

describe('POST /convert — validation', () => {
  test('returns 400 for empty body', async () => {
    const res = await request(app)
      .post('/convert')
      .send({});
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid format', async () => {
    const res = await request(app)
      .post('/convert?format=docx')
      .send({ markdown: '# Hello' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid theme in PDF', async () => {
    const res = await request(app)
      .post('/convert')
      .send({ markdown: '# Hello', options: { theme: 'neon' } });
    expect(res.status).toBe(400);
  });

  test('returns 400 for empty markdown', async () => {
    const res = await request(app)
      .post('/convert')
      .send({ markdown: '   ' });
    expect(res.status).toBe(400);
  });
});

describe('404 fallback', () => {
  test('returns 404 for unknown route', async () => {
    const res = await request(app).get('/unknown');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});
