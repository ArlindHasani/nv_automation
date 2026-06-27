import { useEffect, useRef, type RefObject } from "react";

const BOTTOM_THRESHOLD_PX = 48;

/**
 * Auto-scrolls a container to the bottom when content updates, but only if the
 * user is already near the bottom (or after contentKey changes, e.g. a new tab).
 */
export function useStickToBottomScroll<T extends HTMLElement>(
  contentKey: string | number | undefined,
  deps: unknown[],
): RefObject<T | null> {
  const scrollRef = useRef<T>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    stickToBottomRef.current = true;
  }, [contentKey]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function onScroll() {
      const node = scrollRef.current;
      if (!node) return;
      const distanceFromBottom =
        node.scrollHeight - node.scrollTop - node.clientHeight;
      stickToBottomRef.current = distanceFromBottom <= BOTTOM_THRESHOLD_PX;
    }

    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [contentKey]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottomRef.current) return;

    const scrollToBottom = () => {
      const node = scrollRef.current;
      if (!node || !stickToBottomRef.current) return;
      node.scrollTop = node.scrollHeight;
    };

    scrollToBottom();
    requestAnimationFrame(scrollToBottom);
  }, deps);

  return scrollRef;
}
