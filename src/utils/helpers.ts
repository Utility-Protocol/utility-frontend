/**
 * Small, dependency-free helper utilities.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Throttle `fn` so it runs at most once per `wait` ms. Leading and trailing:
 * the first call fires immediately, subsequent calls within the window are
 * coalesced into a single trailing call with the latest arguments.
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  wait: number
): (...args: Parameters<T>) => void {
  let lastRun = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  return (...args: Parameters<T>): void => {
    const now = Date.now();
    const remaining = wait - (now - lastRun);
    lastArgs = args;

    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      lastRun = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        lastRun = Date.now();
        timer = null;
        if (lastArgs) fn(...lastArgs);
      }, remaining);
    }
  };
}

/**
 * Debounce `fn` so it runs only after `wait` ms have elapsed since the last
 * call. Useful for resize/settle events.
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
}
