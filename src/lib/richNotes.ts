function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMarkdownToHtml(raw: string): string {
  const escaped = escapeHtml(raw);
  // Protect inline code first
  const codeSlots: string[] = [];
  let working = escaped.replace(/`([^`]+)`/g, (_m, code: string) => {
    const idx = codeSlots.length;
    codeSlots.push(`<code>${code}</code>`);
    return `\u0000CODE${idx}\u0000`;
  });

  // Links: [label](url)
  working = working.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  // Bare URLs not already inside an href="..."
  working = working.replace(
    /(^|[\s(>])(https?:\/\/[^\s<)]+)/g,
    '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>'
  );
  // Bold, italic, strikethrough
  working = working.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  working = working.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  working = working.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Restore inline code
  working = working.replace(/\u0000CODE(\d+)\u0000/g, (_m, idx: string) => codeSlots[Number(idx)] ?? '');
  return working;
}

/**
 * Converts stored Markdown notes into sanitized HTML suitable for the WYSIWYG editor.
 */
export function markdownToEditorHtml(markdown: string): string {
  if (!markdown || !markdown.trim()) return '';
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  let inUl = false;

  const closeUl = () => {
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
  };

  for (const line of lines) {
    const checkMatch = line.match(/^\s*[-*]\s+\[([ xX])\]\s*(.*)$/);
    if (checkMatch) {
      closeUl();
      const checked = checkMatch[1].toLowerCase() === 'x';
      const inner = inlineMarkdownToHtml(checkMatch[2]) || '<br>';
      out.push(
        `<div class="rn-check-item${checked ? ' is-checked' : ''}" data-rn-check="true">` +
          `<input type="checkbox" class="rn-checkbox" contenteditable="false"${checked ? ' checked' : ''} />` +
          `<span class="rn-check-text">${inner}</span>` +
        `</div>`
      );
      continue;
    }

    const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (bulletMatch) {
      if (!inUl) {
        out.push('<ul>');
        inUl = true;
      }
      out.push(`<li>${inlineMarkdownToHtml(bulletMatch[1]) || '<br>'}</li>`);
      continue;
    }

    closeUl();
    if (!line.trim()) {
      out.push('<div><br></div>');
    } else {
      out.push(`<div>${inlineMarkdownToHtml(line)}</div>`);
    }
  }

  closeUl();
  return out.join('');
}

function serializeInlineNodes(parent: Node): string {
  let result = '';
  parent.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      result += (node.textContent ?? '').replace(/\u00A0/g, ' ');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') {
      return;
    }
    const inner = serializeInlineNodes(el);
    if (tag === 'strong' || tag === 'b') {
      result += inner ? `**${inner}**` : '';
    } else if (tag === 'em' || tag === 'i') {
      result += inner ? `*${inner}*` : '';
    } else if (tag === 's' || tag === 'strike' || tag === 'del') {
      result += inner ? `~~${inner}~~` : '';
    } else if (tag === 'code') {
      result += inner ? `\`${inner}\`` : '';
    } else if (tag === 'a') {
      const href = el.getAttribute('href') || '';
      if (href && inner && inner !== href) {
        result += `[${inner}](${href})`;
      } else {
        result += href || inner;
      }
    } else if (tag === 'input') {
      return;
    } else {
      result += inner;
    }
  });
  return result;
}

/**
 * Serializes a contentEditable container back to clean Markdown.
 */
export function editorElementToMarkdown(root: HTMLElement): string {
  const lines: string[] = [];

  const walkBlock = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const txt = (node.textContent ?? '').replace(/\u00A0/g, ' ');
      if (txt.trim()) lines.push(txt);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (el.dataset.rnCheck === 'true' || el.classList.contains('rn-check-item')) {
      const cb = el.querySelector<HTMLInputElement>('input[type="checkbox"]');
      const checked = Boolean(cb?.checked);
      const textSpan = el.querySelector<HTMLElement>('.rn-check-text') ?? el;
      const text = serializeInlineNodes(textSpan).trim();
      lines.push(`- [${checked ? 'x' : ' '}] ${text}`.trimEnd());
      return;
    }

    if (tag === 'ul' || tag === 'ol') {
      el.childNodes.forEach((li) => {
        if (li.nodeType === Node.ELEMENT_NODE && (li as HTMLElement).tagName.toLowerCase() === 'li') {
          const text = serializeInlineNodes(li).trim();
          lines.push(`- ${text}`.trimEnd());
        }
      });
      return;
    }

    if (tag === 'div' || tag === 'p' || tag === 'h1' || tag === 'h2' || tag === 'h3') {
      // Check if it contains nested block elements
      const hasNestedBlocks = Array.from(el.children).some((c) => {
        const ct = c.tagName.toLowerCase();
        return ct === 'div' || ct === 'p' || ct === 'ul' || ct === 'ol';
      });
      if (hasNestedBlocks) {
        el.childNodes.forEach(walkBlock);
      } else {
        lines.push(serializeInlineNodes(el).trimEnd());
      }
      return;
    }

    if (tag === 'br') {
      lines.push('');
      return;
    }

    lines.push(serializeInlineNodes(el).trimEnd());
  };

  root.childNodes.forEach(walkBlock);

  // Trim trailing completely empty lines
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.join('\n');
}
