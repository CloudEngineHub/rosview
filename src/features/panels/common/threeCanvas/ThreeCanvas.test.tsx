/**
 * @vitest-environment happy-dom
 */
import { act, StrictMode, useLayoutEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreeCanvas } from './ThreeCanvas';
import { useThreeCanvas } from './threeCanvasContext';
import { useSceneObject } from './useSceneObject';
import type { ThreeCanvasHandle, ThreeCanvasRenderer } from './threeCanvasRuntime';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type RafEntry = { id: number; cb: FrameRequestCallback };

let rafQueue: RafEntry[] = [];
let nextRafId = 1;
let resizeCallback: ResizeObserverCallback | undefined;
let observedElement: Element | undefined;

function stubRaf(): void {
  rafQueue = [];
  nextRafId = 1;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextRafId++;
    rafQueue.push({ id, cb });
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafQueue = rafQueue.filter((entry) => entry.id !== id);
  });
}

function flushOneRaf(time = 16): void {
  const entry = rafQueue.shift();
  entry?.cb(time);
}

function createFakeRenderer(canvas: HTMLCanvasElement): ThreeCanvasRenderer {
  const viewport = new THREE.Vector4(0, 0, 0, 0);
  const scissor = new THREE.Vector4(0, 0, 0, 0);
  let scissorTest = false;
  return {
    domElement: canvas,
    autoClear: true,
    toneMapping: THREE.NoToneMapping,
    outputColorSpace: THREE.LinearSRGBColorSpace,
    shadowMap: { enabled: false, type: THREE.BasicShadowMap },
    renderLists: { dispose: vi.fn() },
    render: vi.fn(),
    setSize: vi.fn((width: number, height: number) => {
      viewport.set(0, 0, width, height);
    }),
    setPixelRatio: vi.fn(),
    dispose: vi.fn(),
    forceContextLoss: vi.fn(),
    getContext: vi.fn(() => null),
    clearDepth: vi.fn(),
    setScissor: vi.fn((x: number | THREE.Vector4, y?: number, width?: number, height?: number) => {
      if (typeof x === 'object') scissor.copy(x);
      else scissor.set(x, y ?? 0, width ?? 0, height ?? 0);
    }),
    setScissorTest: vi.fn((value: boolean) => {
      scissorTest = value;
    }),
    getScissor: (target: THREE.Vector4) => target.copy(scissor),
    getScissorTest: () => scissorTest,
    setViewport: vi.fn((x: number | THREE.Vector4, y?: number, width?: number, height?: number) => {
      if (typeof x === 'object') viewport.copy(x);
      else viewport.set(x, y ?? 0, width ?? 0, height ?? 0);
    }),
    getViewport: (target: THREE.Vector4) => target.copy(viewport),
  } as unknown as ThreeCanvasRenderer;
}

function fireResize(width: number, height: number): void {
  resizeCallback?.(
    [{ contentRect: { width, height } as DOMRectReadOnly } as ResizeObserverEntry],
    {} as ResizeObserver,
  );
}

describe('ThreeCanvas', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    stubRaf();
    resizeCallback = undefined;
    observedElement = undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }
        observe(element: Element) {
          observedElement = element;
        }
        disconnect = vi.fn();
      },
    );
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it('does not mount children until the handle exists, then child layout runs', () => {
    const log: string[] = [];
    const firstCommitChildLog: string[] = [];
    function Child() {
      log.push('child-render');
      useThreeCanvas();
      useLayoutEffect(() => {
        log.push('child-layout');
      }, []);
      return null;
    }
    function FirstCommitProbe({ children }: { children: ReactNode }) {
      useLayoutEffect(() => {
        firstCommitChildLog.push(...log);
      }, []);
      return children;
    }

    act(() => {
      root.render(
        <FirstCommitProbe>
          <ThreeCanvas
            background="#111111"
            gizmoLabelColor="#ffffff"
            autoFrameToGrid={false}
            createRenderer={(canvas) => createFakeRenderer(canvas)}
          >
            <Child />
          </ThreeCanvas>
        </FirstCommitProbe>,
      );
    });

    expect(firstCommitChildLog).toEqual([]);
    expect(log[0]).toBe('child-render');
    expect(log).toContain('child-layout');
    expect(container.querySelector('[data-testid="three-canvas"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="three-canvas"] canvas')).not.toBeNull();
  });

  it('shows a WebGL overlay and keeps children unmounted when the renderer fails', () => {
    const log: string[] = [];
    function Child() {
      log.push('child-render');
      return null;
    }

    act(() => {
      root.render(
        <ThreeCanvas
          background="#111111"
          gizmoLabelColor="#ffffff"
          autoFrameToGrid={false}
          createRenderer={() => {
            throw new Error('Error creating WebGL context');
          }}
        >
          <Child />
        </ThreeCanvas>,
      );
    });

    expect(log).toEqual([]);
    expect(container.querySelector('[data-testid="three-canvas-webgl-unavailable"]')?.textContent).toBe(
      'WebGL unavailable',
    );
    expect(container.querySelector('[data-testid="three-canvas"] canvas')).toBeNull();
  });

  it('applies the themed background before the first renderer.render', () => {
    let firstBackground: THREE.ColorRepresentation | null | undefined;
    const createRenderer = (canvas: HTMLCanvasElement): ThreeCanvasRenderer => {
      const fake = createFakeRenderer(canvas);
      fake.render = vi.fn((scene: THREE.Object3D) => {
        if (firstBackground === undefined && scene instanceof THREE.Scene && scene.background) {
          firstBackground = scene.background as THREE.Color;
        }
      });
      return fake;
    };

    act(() => {
      root.render(
        <ThreeCanvas
          background="#ff00aa"
          gizmoLabelColor="#ffffff"
          autoFrameToGrid={false}
          createRenderer={createRenderer}
        />,
      );
    });

    act(() => {
      fireResize(320, 240);
    });
    act(() => {
      flushOneRaf();
    });

    expect(firstBackground).toBeInstanceOf(THREE.Color);
    expect((firstBackground as THREE.Color).getHexString()).toBe('ff00aa');
  });

  it('Strict Mode remount creates a new canvas and loses only the old context', () => {
    const canvases: HTMLCanvasElement[] = [];
    const lost: HTMLCanvasElement[] = [];
    let handle: ThreeCanvasHandle | undefined;

    function Probe() {
      handle = useThreeCanvas();
      return null;
    }

    const createRenderer = (canvas: HTMLCanvasElement): ThreeCanvasRenderer => {
      canvases.push(canvas);
      const fake = createFakeRenderer(canvas);
      fake.forceContextLoss = vi.fn(() => {
        lost.push(canvas);
      });
      return fake;
    };

    act(() => {
      root.render(
        <StrictMode>
          <ThreeCanvas
            background="#111111"
            gizmoLabelColor="#ffffff"
            autoFrameToGrid={false}
            createRenderer={createRenderer}
          >
            <Probe />
          </ThreeCanvas>
        </StrictMode>,
      );
    });

    expect(canvases.length).toBe(2);
    expect(lost).toEqual([canvases[0]]);
    expect(canvases[0]).not.toBe(canvases[1]);
    expect(canvases[0]?.isConnected).toBe(false);
    expect(canvases[1]?.isConnected).toBe(true);
    expect(handle?.camera).toBeInstanceOf(THREE.PerspectiveCamera);
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
  });

  it('useThreeCanvas throws outside a ready provider', () => {
    let thrown: Error | undefined;
    function Outside() {
      try {
        useThreeCanvas();
      } catch (error) {
        thrown = error as Error;
      }
      return null;
    }

    act(() => {
      root.render(<Outside />);
    });

    expect(thrown?.message).toMatch(/useThreeCanvas\(\) requires a ready <ThreeCanvas> ancestor/);
  });

  it('updates camera aspect from ResizeObserver width and height', () => {
    let handle: ThreeCanvasHandle | undefined;
    let fake: ThreeCanvasRenderer | undefined;
    function Probe() {
      handle = useThreeCanvas();
      return null;
    }

    act(() => {
      root.render(
        <ThreeCanvas
          background="#111111"
          gizmoLabelColor="#ffffff"
          autoFrameToGrid={false}
          createRenderer={(canvas) => {
            fake = createFakeRenderer(canvas);
            return fake;
          }}
        >
          <Probe />
        </ThreeCanvas>,
      );
    });

    expect(observedElement).toBeDefined();
    act(() => {
      fireResize(320, 240);
    });
    expect(handle?.camera.aspect).toBeCloseTo(320 / 240);
    expect(handle?.size).toMatchObject({ width: 320, height: 240 });
    expect(fake?.setSize).toHaveBeenCalledWith(320, 240, false);
  });

  it('useSceneObject adds to contentRoot and removes without disposing geometry', () => {
    const geometry = new THREE.BoxGeometry();
    const disposeSpy = vi.spyOn(geometry, 'dispose');
    const mesh = new THREE.Mesh(geometry);
    let handle: ThreeCanvasHandle | undefined;

    function Child() {
      handle = useThreeCanvas();
      useSceneObject(mesh);
      return null;
    }

    act(() => {
      root.render(
        <ThreeCanvas
          background="#111111"
          gizmoLabelColor="#ffffff"
          autoFrameToGrid={false}
          createRenderer={(canvas) => createFakeRenderer(canvas)}
        >
          <Child />
        </ThreeCanvas>,
      );
    });

    expect(handle?.contentRoot.children).toContain(mesh);

    act(() => {
      root.render(
        <ThreeCanvas
          background="#111111"
          gizmoLabelColor="#ffffff"
          autoFrameToGrid={false}
          createRenderer={(canvas) => createFakeRenderer(canvas)}
        />,
      );
    });

    expect(handle?.contentRoot.children).not.toContain(mesh);
    expect(disposeSpy).not.toHaveBeenCalled();
  });

  it('updates background and gizmo label color after mount', () => {
    let handle: ThreeCanvasHandle | undefined;
    function Probe() {
      handle = useThreeCanvas();
      return null;
    }

    act(() => {
      root.render(
        <ThreeCanvas
          background="#111111"
          gizmoLabelColor="#ffffff"
          autoFrameToGrid={false}
          createRenderer={(canvas) => createFakeRenderer(canvas)}
        >
          <Probe />
        </ThreeCanvas>,
      );
    });

    const setBackground = vi.spyOn(handle!, 'setBackground');
    const setGizmoLabelColor = vi.spyOn(handle!, 'setGizmoLabelColor');
    const invalidate = vi.spyOn(handle!, 'invalidate');

    act(() => {
      root.render(
        <ThreeCanvas
          background="#f8fafc"
          gizmoLabelColor="#0f172a"
          autoFrameToGrid={false}
          createRenderer={(canvas) => createFakeRenderer(canvas)}
        >
          <Probe />
        </ThreeCanvas>,
      );
    });

    expect(setBackground).toHaveBeenCalledWith('#f8fafc');
    expect(setGizmoLabelColor).toHaveBeenCalledWith('#0f172a');
    expect(invalidate).toHaveBeenCalled();
    expect((handle?.scene.background as THREE.Color).getHexString()).toBe('f8fafc');
  });
});
