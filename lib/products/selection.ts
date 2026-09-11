/** Keep only selected IDs that remain in the visible/filtered set. */
export function reconcileSelectedIds(
  selected: Iterable<number>,
  visibleIds: Iterable<number>
): number[] {
  const visible = new Set(visibleIds);
  const out: number[] = [];
  for (const id of selected) {
    if (visible.has(id)) out.push(id);
  }
  return out;
}
