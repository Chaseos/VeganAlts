import { useRef, type HTMLAttributes } from "react";

/** Horizontal gestures leave vertical scrolling and pinch zoom to the browser. */
export function usePhotoSwipe(step: (direction: number) => void) {
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const swiped = useRef(false);
  return {
    onPointerDown(event) {
      swiped.current = false;
      gesture.current = event.isPrimary
        ? { id: event.pointerId, x: event.clientX, y: event.clientY }
        : null;
    },
    onPointerCancel() {
      gesture.current = null;
    },
    onPointerUp(event) {
      const start = gesture.current;
      gesture.current = null;
      if (!start || start.id !== event.pointerId) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        swiped.current = true;
        step(dx < 0 ? 1 : -1);
      }
    },
    onClickCapture(event) {
      if (!swiped.current) return;
      swiped.current = false;
      // Ignore a drag's synthesized click, but allow keyboard activation.
      if (event.detail > 0) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
  } satisfies HTMLAttributes<HTMLElement>;
}
