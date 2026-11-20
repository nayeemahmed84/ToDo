export interface ContextSubmenuPosition {
  top: number;
  left: number;
}

export function getContextSubmenuPosition(anchor: DOMRect): ContextSubmenuPosition {
  const padding = 8;
  const width = Math.min(280, window.innerWidth - padding * 2);
  const height = Math.min(420, window.innerHeight - padding * 2);
  const left = anchor.right + width <= window.innerWidth - padding
    ? anchor.right
    : Math.max(padding, anchor.left - width);
  const top = Math.max(
    padding,
    Math.min(anchor.top, window.innerHeight - height - padding)
  );

  return { top, left };
}
