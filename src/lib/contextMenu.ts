export interface ContextSubmenuPosition {
  top: number;
  left: number;
}

export function getContextSubmenuPosition(
  anchor: DOMRect,
  submenuWidth = 220
): ContextSubmenuPosition {
  const padding = 8;
  const gap = 4;
  const width = Math.min(submenuWidth, window.innerWidth - padding * 2);
  const height = Math.min(420, window.innerHeight - padding * 2);
  const left = anchor.right + gap + width <= window.innerWidth - padding
    ? anchor.right + gap
    : Math.max(padding, anchor.left - width - gap);
  const top = Math.max(
    padding,
    Math.min(anchor.top, window.innerHeight - height - padding)
  );

  return { top, left };
}
