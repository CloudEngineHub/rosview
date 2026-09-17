import { useLayoutEffect } from 'react';
import type { Object3D } from 'three';
import { useThreeCanvas } from './threeCanvasContext';

/** Attach/detach a THREE.Object3D on `contentRoot`. Never disposes GPU resources. */
export function useSceneObject(object: Object3D | null): void {
  const { contentRoot, invalidate } = useThreeCanvas();

  useLayoutEffect(() => {
    if (!object) return;
    contentRoot.add(object);
    invalidate();
    return () => {
      contentRoot.remove(object);
      invalidate();
    };
  }, [contentRoot, invalidate, object]);
}
