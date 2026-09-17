import * as THREE from 'three';
import type { ScenePanelThemeColors } from '@/features/panels/common/scenePanelTheme';

export type SceneChrome = {
  object: THREE.Object3D;
  dispose: () => void;
};

function disposeAllocated(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!material) return;
    if (Array.isArray(material)) {
      for (const entry of material) entry.dispose();
    } else {
      material.dispose();
    }
  });
}

export function createZUpLights(
  options: { preset: 'full'; colors: ScenePanelThemeColors } | { preset: 'preview' },
): SceneChrome {
  const group = new THREE.Group();
  group.name = 'zUpLights';

  if (options.preset === 'preview') {
    group.add(new THREE.AmbientLight(0xffffff, 0.45));
    group.add(new THREE.HemisphereLight('#ffffff', '#6b7280', 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.05);
    key.position.set(6, -4, 8);
    group.add(key);
  } else {
    const { colors } = options;
    group.add(new THREE.AmbientLight(0xffffff, colors.ambientLightIntensity));
    group.add(new THREE.HemisphereLight('#ffffff', '#6b7280', colors.hemisphereLightIntensity));
    const key = new THREE.DirectionalLight(0xffffff, colors.keyLightIntensity);
    key.position.set(6, -4, 8);
    group.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, colors.fillLightIntensity);
    fill.position.set(-6, 4, 5);
    group.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, colors.rimLightIntensity);
    rim.position.set(-2, -7, 6);
    group.add(rim);
  }

  return {
    object: group,
    dispose: () => {
      disposeAllocated(group);
    },
  };
}

export function createZUpGrid(args: {
  size: number;
  divisions: number;
  primary: string;
  secondary: string;
  position?: THREE.Vector3;
  /** ThreeD/Pose: +Math.PI/2. Preview: -Math.PI/2. Required — no silent default that changes Preview scale. */
  rotationX: number;
}): SceneChrome {
  const grid = new THREE.GridHelper(args.size, args.divisions, args.primary, args.secondary);
  grid.rotation.x = args.rotationX;
  if (args.position) {
    grid.position.copy(args.position);
  }
  return {
    object: grid,
    dispose: () => {
      disposeAllocated(grid);
    },
  };
}

export function createAxesHelper(size: number): SceneChrome {
  const axes = new THREE.AxesHelper(size);
  return {
    object: axes,
    dispose: () => {
      disposeAllocated(axes);
    },
  };
}
