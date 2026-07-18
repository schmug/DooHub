import { useCallback, useEffect, useMemo, useState } from "react";
import type { TriangleEvent } from "../types";
import { getStoredSelection, pruneSelection, storeSelection } from "./selection";

export interface Selection {
  ids: string[];
  count: number;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  clear: () => void;
}

/**
 * Owns the hand-picked event set and mirrors it into localStorage. Ids left over
 * from events a weekly refresh has dropped are pruned once the event list is
 * known, so the count never overstates what will actually export.
 */
export function useSelection(events: TriangleEvent[]): Selection {
  const [ids, setIds] = useState<string[]>(getStoredSelection);

  useEffect(() => {
    // Guard on empty: an empty event list means "not loaded" or "load failed",
    // and pruning against it would silently wipe a valid stored selection.
    if (events.length === 0) return;
    setIds((prev) => {
      const pruned = pruneSelection(prev, events);
      if (pruned.length === prev.length) return prev;
      storeSelection(pruned);
      return pruned;
    });
  }, [events]);

  const picked = useMemo(() => new Set(ids), [ids]);
  const isSelected = useCallback((id: string) => picked.has(id), [picked]);

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      storeSelection(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setIds([]);
    storeSelection([]);
  }, []);

  return { ids, count: ids.length, isSelected, toggle, clear };
}
