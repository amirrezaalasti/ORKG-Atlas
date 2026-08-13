/**
 * Lightweight markdown renderer used by chat messages.
 *
 * The chat page asks the LLM for markdown (not HTML) so we control the final
 * surface. We convert a useful subset (headings, paragraphs, lists, links,
 * inline code, fenced code, blockquotes, bold/italic) and run DOMPurify to
 * neutralise anything the model might smuggle in.
 *
 * `react-markdown` is intentionally avoided to keep the dependency tree thin;
 * this renderer is ~150 lines and easy to evolve when we need more features.
 */

import { useMemo, type MouseEvent } from 'react';
import DOMPurify from 'dompurify';
import { Box, type SxProps, type Theme } from '@mui/material';
import { useChatPreviewOptional } from '../../context/ChatPreviewContext';

/** Strip hallucinated inline chart images / huge base64 blobs from assistant text. */
export const sanitizeChatMarkdown = (markdown: string): string => {
  let out = markdown;
  out = out.replace(/!\[[^\]]*]\(data:[^)]+\)/gi, '');
  out = out.replace(/!\[[^\]]*]\([^)]*base64[^)]*\)/gi, '');
  out = out.replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=\s]{80,}/gi, '');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
};

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderInline = (text: string): string => {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  out = out.replace(
    /\[([^\]]+)\]\(([^\s)]+)\)/g,
    (_, label: string, href: string) => {
      const safe =
        href.startsWith('http://') ||
        href.startsWith('https://') ||
        href.startsWith('mailto:')
          ? href
          : '#';
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
  );
  return out;
};

const renderMarkdownToHtml = (markdown: string): string => {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let inList: 'ul' | 'ol' | null = null;
  let inCode = false;
  let codeLang = '';
  let codeBuffer: string[] = [];
  let inBlockquote = false;
  const paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const text = paragraphBuffer.join(' ').trim();
    if (text) html.push(`<p>${renderInline(text)}</p>`);
    paragraphBuffer.length = 0;
  };

  const closeList = () => {
    if (inList) {
      html.push(`</${inList}>`);
      inList = null;
    }
  };

  const closeBlockquote = () => {
    if (inBlockquote) {
      html.push(`</blockquote>`);
      inBlockquote = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine;
    const trimmed = line.trim();

    if (inCode) {
      if (trimmed.startsWith('```')) {
        const codeText = escapeHtml(codeBuffer.join('\n'));
        const langClass = codeLang
          ? ` class="language-${escapeHtml(codeLang)}"`
          : '';
        html.push(`<pre><code${langClass}>${codeText}</code></pre>`);
        inCode = false;
        codeLang = '';
        codeBuffer = [];
      } else {
        codeBuffer.push(line);
      }
      continue;
    }

    if (trimmed.startsWith('```')) {
      flushParagraph();
      closeList();
      closeBlockquote();
      inCode = true;
      codeLang = trimmed.slice(3).trim();
      continue;
    }

    if (trimmed === '') {
      flushParagraph();
      closeList();
      closeBlockquote();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      closeList();
      closeBlockquote();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    if (trimmed.startsWith('> ')) {
      flushParagraph();
      closeList();
      if (!inBlockquote) {
        html.push('<blockquote>');
        inBlockquote = true;
      }
      html.push(`<p>${renderInline(trimmed.slice(2))}</p>`);
      continue;
    } else {
      closeBlockquote();
    }

    const ulMatch = /^[-*]\s+(.*)$/.exec(trimmed);
    const olMatch = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (ulMatch || olMatch) {
      flushParagraph();
      const desired: 'ul' | 'ol' = ulMatch ? 'ul' : 'ol';
      if (inList && inList !== desired) {
        html.push(`</${inList}>`);
        inList = null;
      }
      if (!inList) {
        html.push(`<${desired}>`);
        inList = desired;
      }
      const itemText = (ulMatch ? ulMatch[1] : olMatch![1]).trim();
      html.push(`<li>${renderInline(itemText)}</li>`);
      continue;
    } else {
      closeList();
    }

    paragraphBuffer.push(trimmed);
  }

  flushParagraph();
  closeList();
  closeBlockquote();
  if (inCode) {
    html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
  }

  return html.join('\n');
};

const markdownStyles: SxProps<Theme> = {
  '& h1, & h2, & h3, & h4': { mt: 1.5, mb: 1, fontWeight: 600 },
  '& h1': { fontSize: '1.4rem' },
  '& h2': { fontSize: '1.2rem' },
  '& h3': { fontSize: '1.05rem' },
  '& p': { mb: 1, lineHeight: 1.55 },
  '& ul, & ol': { pl: 3, mb: 1 },
  '& li': { mb: 0.25 },
  '& code': {
    backgroundColor: (t) => t.palette.action.hover,
    px: 0.5,
    py: 0.1,
    borderRadius: 0.5,
    fontSize: '0.875em',
    fontFamily:
      'ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono","Courier New",monospace',
  },
  '& pre': {
    backgroundColor: (t) => t.palette.action.hover,
    p: 1.5,
    borderRadius: 1,
    overflowX: 'auto',
    fontSize: '0.85em',
    mb: 1.5,
  },
  '& pre code': { backgroundColor: 'transparent', p: 0 },
  '& blockquote': {
    borderLeft: '3px solid',
    borderColor: 'divider',
    pl: 2,
    color: 'text.secondary',
    my: 1,
  },
  '& a': { color: 'primary.main' },
  '& a:hover': { textDecoration: 'underline' },
};

interface ChatMarkdownProps {
  text: string;
  /** Apply a tighter spacing variant for tool-result summaries. */
  dense?: boolean;
}

const ChatMarkdown = ({ text, dense }: ChatMarkdownProps) => {
  const { tryOpenPreviewFromClick } = useChatPreviewOptional();
  const html = useMemo(() => {
    const raw = renderMarkdownToHtml(sanitizeChatMarkdown(text));
    return DOMPurify.sanitize(raw, {
      ADD_ATTR: ['target', 'rel'],
    });
  }, [text]);

  const onContentClick = (e: MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor?.href) return;
    tryOpenPreviewFromClick(
      e,
      anchor.href,
      anchor.textContent?.trim() || undefined
    );
  };

  return (
    <Box
      onClick={onContentClick}
      sx={{
        ...markdownStyles,
        ...(dense ? { '& p': { mb: 0.5, lineHeight: 1.4 } } : {}),
        '& a': { cursor: 'pointer' },
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default ChatMarkdown;
