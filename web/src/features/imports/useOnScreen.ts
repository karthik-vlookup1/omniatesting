import { useEffect, useRef, useState } from 'react';

/**
 * True once the element has come within `rootMargin` of the viewport, then stays true (data for a
 * row is fetched once). Where IntersectionObserver is unavailable, the element counts as visible.
 */
export function useOnScreen<T extends Element>(rootMargin = '200px') {
  const ref = useRef<T | null>(null);
  const supported = typeof IntersectionObserver !== 'undefined';
  const [seen, setSeen] = useState(!supported);

  useEffect(() => {
    const el = ref.current;
    if (!supported || seen || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [supported, seen, rootMargin]);

  return { ref, seen };
}
