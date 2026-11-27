import { ReactNode } from 'react';

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Matches: [label](url), `code`, **bold**, *italic*, ~~strike~~, or bare https?:// url
  const tokenRegex =
    /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|~~([^~]+)~~|(https?:\/\/[^\s<]+))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[2] && match[3]) {
      nodes.push(
        <a
          key={key++}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="md-link"
          onClick={(e) => e.stopPropagation()}
        >
          {match[2]}
        </a>
      );
    } else if (match[4]) {
      nodes.push(
        <code key={key++} className="md-inline-code">
          {match[4]}
        </code>
      );
    } else if (match[5]) {
      nodes.push(<strong key={key++}>{match[5]}</strong>);
    } else if (match[6]) {
      nodes.push(<em key={key++}>{match[6]}</em>);
    } else if (match[7]) {
      nodes.push(<del key={key++}>{match[7]}</del>);
    } else if (match[8]) {
      const cleaned = match[8].replace(/[.,!?;:)]+$/, '');
      const trailing = match[8].slice(cleaned.length);
      nodes.push(
        <a
          key={key++}
          href={cleaned}
          target="_blank"
          rel="noopener noreferrer"
          className="md-link"
          onClick={(e) => e.stopPropagation()}
        >
          {cleaned}
        </a>
      );
      if (trailing) nodes.push(trailing);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

export function toggleMarkdownChecklistLine(markdown: string, lineIndex: number): string {
  const lines = markdown.split(/\r?\n/);
  const target = lines[lineIndex];
  if (target === undefined) return markdown;
  const match = target.match(/^(\s*[-*]\s+\[)([ xX])(\]\s*.*)$/);
  if (!match) return markdown;
  const nextMark = match[2] === ' ' ? 'x' : ' ';
  lines[lineIndex] = `${match[1]}${nextMark}${match[3]}`;
  return lines.join('\n');
}

interface MarkdownViewProps {
  content: string;
  onToggleCheckbox?: (lineIndex: number) => void;
}

export function MarkdownView({ content, onToggleCheckbox }: MarkdownViewProps) {
  const lines = content.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      const startIdx = i;
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push(
        <pre key={`code-${startIdx}`} className="md-code-block">
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Checklist item: - [ ] or - [x]
    const checkMatch = line.match(/^\s*[-*]\s+\[([ xX])\]\s*(.*)$/);
    if (checkMatch) {
      const lineIdx = i;
      const checked = checkMatch[1].toLowerCase() === 'x';
      blocks.push(
        <label key={`chk-${lineIdx}`} className={`md-checklist-row ${checked ? 'checked' : ''}`}>
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggleCheckbox?.(lineIdx)}
          />
          <span>{renderInlineMarkdown(checkMatch[2])}</span>
        </label>
      );
      i += 1;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(
        <div key={`h-${i}`} className={`md-heading md-h${level}`}>
          {renderInlineMarkdown(headingMatch[2])}
        </div>
      );
      i += 1;
      continue;
    }

    // Bullet list item
    const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (bulletMatch) {
      blocks.push(
        <div key={`li-${i}`} className="md-bullet">
          <span className="md-bullet-dot" aria-hidden="true">•</span>
          <span>{renderInlineMarkdown(bulletMatch[1])}</span>
        </div>
      );
      i += 1;
      continue;
    }

    if (!line.trim()) {
      blocks.push(<div key={`sp-${i}`} className="md-spacer" />);
      i += 1;
      continue;
    }

    blocks.push(
      <p key={`p-${i}`} className="md-paragraph">
        {renderInlineMarkdown(line)}
      </p>
    );
    i += 1;
  }

  return <div className="md-preview">{blocks}</div>;
}
