import { createContext, useContext } from 'react';
import type { ThreeCanvasHandle } from './threeCanvasRuntime';

export const ThreeCanvasContext = createContext<ThreeCanvasHandle | null>(null);

/** Throws if used outside `<ThreeCanvas>`, or if the handle is not ready yet. */
export function useThreeCanvas(): ThreeCanvasHandle {
  const handle = useContext(ThreeCanvasContext);
  if (handle == null) {
    throw new Error('useThreeCanvas() requires a ready <ThreeCanvas> ancestor');
  }
  return handle;
}
