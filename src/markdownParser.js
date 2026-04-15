'use strict';

const { marked } = require('marked');
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

/**
 * Convert Markdown string to sanitized HTML
 * @param {string} markdown
 * @returns {string} sanitized HTML
 */
function markdownToHtml(markdown) {
  if (typeof markdown !== 'string') {
    throw new TypeError('markdown must be a string');
  }
  const rawHtml = marked.parse(markdown);
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      'h1','h2','h3','h4','h5','h6',
      'p','br','hr',
      'ul','ol','li',
      'a','strong','em','code','pre','blockquote',
      'table','thead','tbody','tr','th','td',
      'img','del','s',
    ],
    ALLOWED_ATTR: ['href','src','alt','title','class'],
  });
}

/**
 * Extract plain text from markdown (strip all syntax)
 * @param {string} markdown
 * @returns {string}
 */
function markdownToText(markdown) {
  if (typeof markdown !== 'string') {
    throw new TypeError('markdown must be a string');
  }
  // Remove common markdown syntax
  return markdown
    .replace(/#{1,6}\s+/g, '')       // headings
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1')     // italic
    .replace(/`{1,3}[^`]*`{1,3}/g, '') // code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // images
    .replace(/^\s*[-*+]\s+/gm, '')   // lists
    .replace(/^\s*\d+\.\s+/gm, '')   // ordered lists
    .replace(/>\s+/g, '')             // blockquotes
    .replace(/---+/g, '')             // hr
    .replace(/\|/g, ' ')              // tables
    .trim();
}

/**
 * Parse markdown and return metadata (word count, headings, etc.)
 * @param {string} markdown
 * @returns {object}
 */
function analyzeMarkdown(markdown) {
  if (typeof markdown !== 'string') {
    throw new TypeError('markdown must be a string');
  }
  const text = markdownToText(markdown);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const headingMatches = markdown.match(/^#{1,6}\s+.+/gm) || [];
  const codeBlockMatches = markdown.match(/```[\s\S]*?```/g) || [];
  const linkMatches = markdown.match(/\[([^\]]+)\]\([^)]+\)/g) || [];

  return {
    wordCount: words.length,
    charCount: text.length,
    headingCount: headingMatches.length,
    codeBlockCount: codeBlockMatches.length,
    linkCount: linkMatches.length,
    estimatedReadTime: Math.max(1, Math.round(words.length / 200)),
  };
}

module.exports = { markdownToHtml, markdownToText, analyzeMarkdown };
