import type { PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Bind stock OrbitControls to the canvas (not the host div). Damping is on;
 * the demand loop must call `controls.update()` each tick.
 */
export function attachOrbitControls(
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
  invalidate: () => void,
): OrbitControls {
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.addEventListener('change', () => {
    invalidate();
  });
  return controls;
}
