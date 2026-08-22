import { useRef, useCallback, useEffect } from "react";

interface SwipeOptions {
  threshold?: number;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

interface TouchPosition {
  x: number;
  y: number;
}

/**
 * Custom hook to detect swipe gestures on touch devices
 * @param options Configuration for swipe detection
 * @returns Ref to attach to the element that should detect swipes
 */
export const useSwipeGesture = ({
  threshold = 50,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
}: SwipeOptions) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<TouchPosition>({ x: 0, y: 0 });
  const touchEndRef = useRef<TouchPosition>({ x: 0, y: 0 });

  const handleSwipe = useCallback(() => {
    const distance = {
      x: touchEndRef.current.x - touchStartRef.current.x,
      y: touchEndRef.current.y - touchStartRef.current.y,
    };

    const absDistX = Math.abs(distance.x);
    const absDistY = Math.abs(distance.y);

    // Only trigger if swipe distance exceeds threshold
    // and the primary direction is more pronounced than the secondary
    if (absDistX > threshold && absDistX > absDistY) {
      if (distance.x > 0) {
        onSwipeRight?.();
      } else {
        onSwipeLeft?.();
      }
    } else if (absDistY > threshold && absDistY > absDistX) {
      if (distance.y > 0) {
        onSwipeDown?.();
      } else {
        onSwipeUp?.();
      }
    }
  }, [threshold, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.changedTouches && e.changedTouches.length > 0) {
        touchStartRef.current = {
          x: e.changedTouches[0].clientX,
          y: e.changedTouches[0].clientY,
        };
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.changedTouches && e.changedTouches.length > 0) {
        touchEndRef.current = {
          x: e.changedTouches[0].clientX,
          y: e.changedTouches[0].clientY,
        };
        handleSwipe();
      }
    };

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleSwipe]);

  return elementRef;
};
