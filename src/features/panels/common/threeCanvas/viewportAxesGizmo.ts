import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GIZMO_AXIS_COLORS, GIZMO_MARGIN, Z_UP } from '@/features/panels/common/zUpSceneLayout';
import type { ThreeCanvasRenderer } from './threeCanvasRuntime';

const AXIS_HEAD_FONT = '18px Inter var, Arial, sans-serif';
const GIZMO_SCALE = 40;
const TURN_RATE = 2 * Math.PI;
const NEGATIVE_HEAD_OPACITY = 0.75;
const AXIS_BOX_SIZE: [number, number, number] = [0.8, 0.05, 0.05];

export type ViewportAxesGizmo = {
  readonly animating: boolean;
  setSize(width: number, height: number): void;
  setLabelColor(color: string): void;
  update(dt: number): void;
  render(renderer: ThreeCanvasRenderer): void;
  dispose(): void;
};

export function createViewportAxesGizmo(options: {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  labelColor: string;
  invalidate: () => void;
}): ViewportAxesGizmo {
  const { canvas, camera, controls, invalidate } = options;
  let labelColor = options.labelColor;
  let width = 0;
  let height = 0;
  let animating = false;
  let disposed = false;
  let radius = 0;

  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.scale.setScalar(GIZMO_SCALE);
  scene.add(root);

  const half = GIZMO_MARGIN[0];
  const orthoCamera = new THREE.OrthographicCamera(-half, half, half, -half, 0, 400);
  orthoCamera.position.set(0, 0, 200);

  const dummy = new THREE.Object3D();
  dummy.up.copy(camera.up);
  const q1 = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const focusPoint = new THREE.Vector3();
  const savedViewport = new THREE.Vector4();
  const savedScissor = new THREE.Vector4();
  const pointerNdc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();

  const boxGeometry = new THREE.BoxGeometry(AXIS_BOX_SIZE[0], AXIS_BOX_SIZE[1], AXIS_BOX_SIZE[2]);
  const axisMaterials = GIZMO_AXIS_COLORS.map(
    (color) =>
      new THREE.MeshBasicMaterial({
        color,
        toneMapped: false,
      }),
  );

  function addAxis(material: THREE.MeshBasicMaterial, rotation: THREE.Euler): void {
    const group = new THREE.Group();
    group.rotation.copy(rotation);
    const mesh = new THREE.Mesh(boxGeometry, material);
    mesh.position.set(0.4, 0, 0);
    group.add(mesh);
    root.add(group);
  }

  addAxis(axisMaterials[0], new THREE.Euler(0, 0, 0));
  addAxis(axisMaterials[1], new THREE.Euler(0, 0, Math.PI / 2));
  addAxis(axisMaterials[2], new THREE.Euler(0, -Math.PI / 2, 0));

  const textures: THREE.CanvasTexture[] = [];
  const headMaterials: THREE.SpriteMaterial[] = [];
  const interactiveHeads: THREE.Sprite[] = [];

  function createHeadTexture(arcStyle: string, label: string | undefined, textColor: string): THREE.CanvasTexture {
    const headCanvas = document.createElement('canvas');
    headCanvas.width = 64;
    headCanvas.height = 64;
    const context = headCanvas.getContext('2d');
    if (context) {
      context.beginPath();
      context.arc(32, 32, 16, 0, Math.PI * 2);
      context.closePath();
      context.fillStyle = arcStyle;
      context.fill();
      if (label) {
        context.font = AXIS_HEAD_FONT;
        context.textAlign = 'center';
        context.textBaseline = 'alphabetic';
        context.fillStyle = textColor;
        context.fillText(label, 32, 41);
      }
    }
    const texture = new THREE.CanvasTexture(headCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    textures.push(texture);
    return texture;
  }

  function addHead(
    position: THREE.Vector3,
    arcStyle: string,
    label: string | undefined,
    direction: THREE.Vector3,
  ): THREE.Sprite {
    const texture = createHeadTexture(arcStyle, label, labelColor);
    const material = new THREE.SpriteMaterial({
      map: texture,
      alphaTest: 0.3,
      opacity: label ? 1 : NEGATIVE_HEAD_OPACITY,
      toneMapped: false,
      depthTest: false,
    });
    headMaterials.push(material);
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.setScalar(label ? 1 : 0.75);
    sprite.userData.axisDirection = direction.clone();
    sprite.userData.label = label;
    sprite.userData.arcStyle = arcStyle;
    root.add(sprite);
    interactiveHeads.push(sprite);
    return sprite;
  }

  addHead(new THREE.Vector3(1, 0, 0), GIZMO_AXIS_COLORS[0], 'X', new THREE.Vector3(1, 0, 0));
  addHead(new THREE.Vector3(0, 1, 0), GIZMO_AXIS_COLORS[1], 'Y', new THREE.Vector3(0, 1, 0));
  addHead(new THREE.Vector3(0, 0, 1), GIZMO_AXIS_COLORS[2], 'Z', new THREE.Vector3(0, 0, 1));
  addHead(new THREE.Vector3(-1, 0, 0), GIZMO_AXIS_COLORS[0], undefined, new THREE.Vector3(-1, 0, 0));
  addHead(new THREE.Vector3(0, -1, 0), GIZMO_AXIS_COLORS[1], undefined, new THREE.Vector3(0, -1, 0));
  addHead(new THREE.Vector3(0, 0, -1), GIZMO_AXIS_COLORS[2], undefined, new THREE.Vector3(0, 0, -1));

  function overlayDim(): number {
    const requested = GIZMO_MARGIN[0] * 2;
    if (width <= 0 || height <= 0) return requested;
    return Math.min(requested, width, height);
  }

  function tweenCamera(direction: THREE.Vector3): void {
    animating = true;
    dummy.up.copy(camera.up);
    focusPoint.copy(controls.target);
    radius = camera.position.distanceTo(focusPoint);
    q1.copy(camera.quaternion);
    dummy.position.set(0, 0, 0);
    dummy.up.copy(camera.up);
    dummy.lookAt(direction);
    q2.copy(dummy.quaternion);
    invalidate();
  }

  function hitTest(event: PointerEvent): THREE.Vector3 | null {
    if (width <= 0 || height <= 0) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const dim = overlayDim();
    const scaleX = rect.width / width;
    const dimCss = dim * scaleX;
    const left = rect.left + rect.width - dimCss;
    const top = rect.top + rect.height - dimCss;
    if (event.clientX < left || event.clientY < top || event.clientX > rect.right || event.clientY > rect.bottom) {
      return null;
    }
    pointerNdc.x = ((event.clientX - left) / dimCss) * 2 - 1;
    pointerNdc.y = -((event.clientY - top) / dimCss) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, orthoCamera);
    const hits = raycaster.intersectObjects(interactiveHeads, false);
    const direction: unknown = hits[0]?.object.userData.axisDirection;
    return direction instanceof THREE.Vector3 ? direction : null;
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (disposed || event.button !== 0 || animating) return;
    const direction = hitTest(event);
    if (!direction) return;
    event.stopPropagation();
    tweenCamera(direction);
  };

  canvas.addEventListener('pointerdown', onPointerDown, true);

  return {
    get animating() {
      return animating;
    },
    setSize(nextWidth: number, nextHeight: number) {
      width = nextWidth;
      height = nextHeight;
    },
    setLabelColor(color: string) {
      if (color === labelColor) return;
      labelColor = color;
      for (const sprite of interactiveHeads) {
        const label = sprite.userData.label as string | undefined;
        if (!label) continue;
        const material = sprite.material;
        const prev = material.map;
        const texture = createHeadTexture(sprite.userData.arcStyle as string, label, labelColor);
        material.map = texture;
        material.needsUpdate = true;
        prev?.dispose();
        const idx = textures.indexOf(prev as THREE.CanvasTexture);
        if (idx >= 0) textures.splice(idx, 1);
      }
    },
    update(dt: number) {
      if (!animating || disposed) return;
      if (q1.angleTo(q2) < 0.01) {
        animating = false;
        camera.up.copy(Z_UP);
        dummy.up.copy(Z_UP);
        controls.update(dt);
        return;
      }
      const step = dt * TURN_RATE;
      q1.rotateTowards(q2, step);
      camera.position.set(0, 0, 1).applyQuaternion(q1).multiplyScalar(radius).add(focusPoint);
      camera.up.set(0, 1, 0).applyQuaternion(q1).normalize();
      camera.quaternion.copy(q1);
      controls.update(dt);
      invalidate();
    },
    render(renderer: ThreeCanvasRenderer) {
      if (disposed || width <= 0 || height <= 0) return;

      root.quaternion.copy(camera.quaternion).invert();
      root.updateMatrixWorld(true);

      const savedAutoClear = renderer.autoClear;
      const savedScissorTest = renderer.getScissorTest();
      renderer.getViewport(savedViewport);
      renderer.getScissor(savedScissor);

      const dim = overlayDim();
      const x = width - dim;
      const y = 0;

      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.setScissorTest(true);
      renderer.setViewport(x, y, dim, dim);
      renderer.setScissor(x, y, dim, dim);
      renderer.render(scene, orthoCamera);

      renderer.autoClear = savedAutoClear;
      renderer.setViewport(savedViewport.x, savedViewport.y, savedViewport.z, savedViewport.w);
      renderer.setScissor(savedScissor.x, savedScissor.y, savedScissor.z, savedScissor.w);
      renderer.setScissorTest(savedScissorTest);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      animating = false;
      canvas.removeEventListener('pointerdown', onPointerDown, true);
      boxGeometry.dispose();
      for (const material of axisMaterials) material.dispose();
      for (const material of headMaterials) {
        material.map = null;
        material.dispose();
      }
      for (const texture of textures) texture.dispose();
      textures.length = 0;
      headMaterials.length = 0;
      interactiveHeads.length = 0;
    },
  };
}
