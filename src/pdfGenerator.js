'use strict';

const PDFDocument = require('pdfkit');

// Font sizes per element type
const SIZES = {
  h1: 28, h2: 22, h3: 18, h4: 15, h5: 13, h6: 12,
  body: 11, code: 10, blockquote: 11,
};

// Theme color palettes
const THEMES = {
  default: {
    h1: '#1a1a2e', h2: '#16213e', h3: '#0f3460',
    body: '#333333', code: '#333333', codeBg: '#f4f4f4',
    blockquote: '#555555', hr: '#cccccc', link: '#0066cc',
  },
  dark: {
    h1: '#e0e0e0', h2: '#b0c4de', h3: '#87ceeb',
    body: '#d0d0d0', code: '#98fb98', codeBg: '#2d2d2d',
    blockquote: '#a0a0a0', hr: '#555555', link: '#6fa8dc',
  },
  github: {
    h1: '#24292e', h2: '#24292e', h3: '#24292e',
    body: '#24292e', code: '#24292e', codeBg: '#f6f8fa',
    blockquote: '#6a737d', hr: '#e1e4e8', link: '#0366d6',
  },
  minimal: {
    h1: '#000000', h2: '#222222', h3: '#444444',
    body: '#444444', code: '#555555', codeBg: '#f9f9f9',
    blockquote: '#777777', hr: '#dddddd', link: '#333333',
  },
};

/**
 * Parse a very simple token list from HTML-like content
 * We use a simple line-based approach on markdown content directly.
 */
function parseTokens(markdown) {
  const tokens = [];
  const lines = markdown.split('\n');
  let inCode = false;
  let codeBuffer = [];
  let codeLanguage = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block start/end
    if (line.startsWith('```')) {
      if (!inCode) {
        inCode = true;
        codeLanguage = line.slice(3).trim();
        codeBuffer = [];
      } else {
        inCode = false;
        tokens.push({ type: 'code', content: codeBuffer.join('\n'), language: codeLanguage });
        codeBuffer = [];
        codeLanguage = '';
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      tokens.push({ type: `h${level}`, content: stripInline(headingMatch[2]) });
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      tokens.push({ type: 'hr' });
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      tokens.push({ type: 'blockquote', content: stripInline(line.slice(2)) });
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)/);
    if (ulMatch) {
      const indent = Math.floor(ulMatch[1].length / 2);
      tokens.push({ type: 'li', content: stripInline(ulMatch[2]), indent });
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)/);
    if (olMatch) {
      const indent = Math.floor(olMatch[1].length / 2);
      tokens.push({ type: 'li', content: stripInline(olMatch[2]), indent, ordered: true });
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      tokens.push({ type: 'blank' });
      continue;
    }

    // Paragraph
    tokens.push({ type: 'p', content: stripInline(line) });
  }

  return tokens;
}

function stripInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .trim();
}

/**
 * Generate PDF buffer from markdown
 * @param {string} markdown
 * @param {object} options
 * @param {string} options.theme - 'default'|'dark'|'github'|'minimal'
 * @param {string} options.title - document title
 * @param {string} options.author - document author
 * @returns {Promise<Buffer>}
 */
function generatePdf(markdown, options = {}) {
  return new Promise((resolve, reject) => {
    const theme = THEMES[options.theme] || THEMES.default;
    const isDark = options.theme === 'dark';

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 60, bottom: 60, left: 72, right: 72 },
      info: {
        Title: options.title || 'Document',
        Author: options.author || 'markdown-to-pdf-api',
        Creator: 'markdown-to-pdf-api',
      },
    });

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Background for dark theme
    if (isDark) {
      doc.rect(0, 0, doc.page.width, doc.page.height).fill('#1e1e1e');
      doc.fillColor(theme.body);
    }

    const tokens = parseTokens(markdown);
    const pageWidth = doc.page.width - 144; // margins both sides
    let listCounter = 0;

    for (const token of tokens) {
      switch (token.type) {
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6': {
          const size = SIZES[token.type];
          doc.moveDown(0.6)
             .fontSize(size)
             .fillColor(theme[token.type] || theme.h3)
             .font('Helvetica-Bold')
             .text(token.content, { width: pageWidth });
          // Underline for h1
          if (token.type === 'h1') {
            doc.moveDown(0.1)
               .strokeColor(theme.hr)
               .lineWidth(1)
               .moveTo(72, doc.y)
               .lineTo(72 + pageWidth, doc.y)
               .stroke();
          }
          break;
        }

        case 'p': {
          doc.fontSize(SIZES.body)
             .fillColor(theme.body)
             .font('Helvetica')
             .moveDown(0.3)
             .text(token.content, { width: pageWidth, align: 'justify' });
          break;
        }

        case 'code': {
          const codeLines = token.content.split('\n');
          // Box background
          const boxHeight = codeLines.length * 14 + 16;
          doc.rect(72, doc.y + 4, pageWidth, boxHeight)
             .fill(theme.codeBg);
          doc.fillColor(theme.code)
             .fontSize(SIZES.code)
             .font('Courier')
             .moveDown(0.2);
          for (const codeLine of codeLines) {
            doc.text(codeLine || ' ', 80, doc.y, { width: pageWidth - 16 });
          }
          doc.moveDown(0.4);
          break;
        }

        case 'blockquote': {
          // Left bar
          doc.rect(72, doc.y + 4, 3, 16)
             .fill(theme.blockquote);
          doc.fontSize(SIZES.blockquote)
             .fillColor(theme.blockquote)
             .font('Helvetica-Oblique')
             .moveDown(0.2)
             .text(token.content, 82, doc.y, { width: pageWidth - 10 });
          doc.moveDown(0.3);
          break;
        }

        case 'li': {
          const xOffset = 72 + token.indent * 16;
          const bullet = token.ordered ? '•' : '•';
          doc.fontSize(SIZES.body)
             .fillColor(theme.body)
             .font('Helvetica')
             .text(`${bullet} ${token.content}`, xOffset + 12, doc.y, { width: pageWidth - 12 - token.indent * 16 });
          break;
        }

        case 'hr': {
          doc.moveDown(0.5)
             .strokeColor(theme.hr)
             .lineWidth(0.5)
             .moveTo(72, doc.y)
             .lineTo(72 + pageWidth, doc.y)
             .stroke()
             .moveDown(0.5);
          break;
        }

        case 'blank': {
          doc.moveDown(0.4);
          break;
        }
      }
    }

    doc.end();
  });
}

module.exports = { generatePdf, THEMES };
