export function reorderTarget(heights: readonly number[], from: number, dy: number): number {
  let to = from;
  let travelled = 0;
  const step = dy > 0 ? 1 : -1;
  const distance = Math.abs(dy);
  for (let i = from + step; i >= 0 && i < heights.length; i += step) {
    const height = heights[i] ?? 0;
    if (distance <= travelled + height / 2) break;
    to = i;
    travelled += height;
  }
  return to;
}

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item === undefined) return [...list];
  next.splice(to, 0, item);
  return next;
}

export function shiftFor(index: number, from: number, to: number, draggedHeight: number): number {
  if (index === from) return 0;
  if (from < to && index > from && index <= to) return -draggedHeight;
  if (to < from && index >= to && index < from) return draggedHeight;
  return 0;
}
