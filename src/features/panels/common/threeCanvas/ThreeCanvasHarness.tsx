import { useLayoutEffect, type ReactElement } from 'react';
import { getScenePanelThemeColors } from '@/features/panels/common/scenePanelTheme';
import { DEFAULT_GRID_DIVISIONS, DEFAULT_GRID_SIZE } from '@/features/panels/common/zUpSceneLayout';
import { ThreeCanvas } from './ThreeCanvas';
import { useThreeCanvas } from './threeCanvasContext';
import { createAxesHelper, createZUpGrid, createZUpLights } from './zUpSceneHelpers';

const HARNESS_COLORS = getScenePanelThemeColors('dark');

function HarnessScene(): null {
  const { scene, invalidate } = useThreeCanvas();
  const colors = HARNESS_COLORS;

  useLayoutEffect(() => {
    const lights = createZUpLights({ preset: 'full', colors });
    const grid = createZUpGrid({
      size: DEFAULT_GRID_SIZE,
      divisions: DEFAULT_GRID_DIVISIONS,
      primary: colors.gridPrimary,
      secondary: colors.gridSecondary,
      rotationX: Math.PI / 2,
    });
    const axes = createAxesHelper(1);
    scene.add(lights.object);
    scene.add(grid.object);
    scene.add(axes.object);
    invalidate();
    return () => {
      scene.remove(lights.object);
      scene.remove(grid.object);
      scene.remove(axes.object);
      lights.dispose();
      grid.dispose();
      axes.dispose();
      invalidate();
    };
  }, [colors, invalidate, scene]);

  return null;
}

/** DEV-only orbit + gizmo page. Open `?threeCanvasHarness`. */
export function ThreeCanvasHarness(): ReactElement {
  const colors = HARNESS_COLORS;
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ThreeCanvas
        shadows
        autoFrameToGrid
        background={colors.sceneBackground}
        gizmoLabelColor={colors.gizmoLabelColor}
      >
        <HarnessScene />
      </ThreeCanvas>
    </div>
  );
}
