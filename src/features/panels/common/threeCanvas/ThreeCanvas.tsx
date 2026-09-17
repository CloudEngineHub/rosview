import { useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type { ColorRepresentation } from 'three';
import {
  createThreeCanvasRuntime,
  type ThreeCanvasGlParams,
  type ThreeCanvasHandle,
  type ThreeCanvasRuntimeOptions,
} from './threeCanvasRuntime';
import { ThreeCanvasContext, useThreeCanvas } from './threeCanvasContext';

export type ThreeCanvasProps = {
  className?: string;
  /** Create-time. Changing it does not recreate the renderer. */
  shadows?: boolean;
  /** Create-time GL constructor flags. */
  gl?: ThreeCanvasGlParams;
  /** Create-time camera. Default `CANVAS_CAMERA`. Always `lookAt(0,0,0)` after apply. */
  camera?: ThreeCanvasRuntimeOptions['camera'];
  /** Create-time. Default true (3D/Pose). Preview passes false. */
  autoFrameToGrid?: boolean;
  /**
   * Applied in the **create** `useLayoutEffect` before the first `invalidate()`,
   * then again in a follow-up layout effect when the prop changes.
   */
  background: ColorRepresentation;
  /** Same timing as `background`. */
  gizmoLabelColor: string;
  /**
   * React children of the **provider**. Must include every `useThreeCanvas()`
   * caller. These are NOT three JSX.
   *
   * **Ready-gate:** children are **not** mounted on the first commit.
   */
  children?: ReactNode;
  /** Test-only seam. Production panels omit this. */
  createRenderer?: ThreeCanvasRuntimeOptions['createRenderer'];
};

export function ThreeCanvas({
  className,
  shadows,
  gl,
  camera,
  autoFrameToGrid,
  background,
  gizmoLabelColor,
  children,
  createRenderer,
}: ThreeCanvasProps): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState<ThreeCanvasHandle | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'block h-full w-full';
    host.appendChild(canvas);
    const runtime = createThreeCanvasRuntime({
      canvas,
      shadows,
      gl,
      camera,
      autoFrameToGrid,
      gizmoLabelColor,
      createRenderer,
    });
    runtime.setBackground(background);
    runtime.setGizmoLabelColor(gizmoLabelColor);

    const applySize = (width: number, height: number): void => {
      runtime.setSize(width, height);
      runtime.invalidate();
    };

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      applySize(rect.width, rect.height);
    });
    observer.observe(host);

    setHandle(runtime);
    runtime.invalidate();
    applySize(host.clientWidth, host.clientHeight);
    return () => {
      observer.disconnect();
      runtime.dispose({ loseContext: true });
      canvas.remove();
      setHandle(null);
    };
    // Mount-only (create-time props). Initial background/gizmoLabelColor come from
    // this first render; dedicated layout effects keep them in sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (!handle) return;
    handle.setBackground(background);
    handle.invalidate();
  }, [handle, background]);

  useLayoutEffect(() => {
    if (!handle) return;
    handle.setGizmoLabelColor(gizmoLabelColor);
    handle.invalidate();
  }, [handle, gizmoLabelColor]);

  return (
    <div
      ref={hostRef}
      data-testid="three-canvas"
      className={`relative h-full w-full overflow-hidden ${className ?? ''}`}
    >
      <ThreeCanvasContext.Provider value={handle}>{handle ? children : null}</ThreeCanvasContext.Provider>
    </div>
  );
}

export { useThreeCanvas };
