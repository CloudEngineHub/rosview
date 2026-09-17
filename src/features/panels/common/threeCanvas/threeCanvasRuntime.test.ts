/**
 * @vitest-environment happy-dom
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createThreeCanvasRuntime,
  type ThreeCanvasRenderer,
  type ThreeCanvasRuntime,
} from './threeCanvasRuntime';

type RafEntry = { id: number; cb: FrameRequestCallback };

let rafQueue: RafEntry[] = [];
let nextRafId = 1;
const runtimes: ThreeCanvasRuntime[] = [];
const canvases: HTMLCanvasElement[] = [];

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
  const renderer: ThreeCanvasRenderer = {
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
  return renderer;
}

function createRuntime(
  overrides: Partial<Parameters<typeof createThreeCanvasRuntime>[0]> = {},
): { runtime: ThreeCanvasRuntime; fake: ThreeCanvasRenderer } {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  canvases.push(canvas);
  const fake = createFakeRenderer(canvas);
  const runtime = createThreeCanvasRuntime({
    canvas,
    gizmoLabelColor: '#ffffff',
    autoFrameToGrid: false,
    createRenderer: () => fake,
    ...overrides,
  });
  runtimes.push(runtime);
  return { runtime, fake };
}

function mainRenderCount(runtime: ThreeCanvasRuntime): number {
  const render = runtime.renderer.render as ReturnType<typeof vi.fn>;
  return render.mock.calls.filter((call) => call[0] === runtime.scene).length;
}

describe('createThreeCanvasRuntime', () => {
  beforeEach(() => {
    stubRaf();
    vi.stubGlobal('devicePixelRatio', 1);
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
  });

  afterEach(() => {
    for (const runtime of runtimes.splice(0)) {
      runtime.dispose({ loseContext: false });
    }
    for (const canvas of canvases.splice(0)) {
      canvas.remove();
    }
    vi.unstubAllGlobals();
  });

  it('sets ACESFilmic tone mapping, sRGB output, Z-up, and lookAt origin', () => {
    const { runtime, fake } = createRuntime();

    expect(fake.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(fake.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect(fake.shadowMap.enabled).toBe(true);
    expect(fake.shadowMap.type).toBe(THREE.PCFSoftShadowMap);
    expect(runtime.camera.up.x).toBe(0);
    expect(runtime.camera.up.y).toBe(0);
    expect(runtime.camera.up.z).toBe(1);

    const forward = new THREE.Vector3();
    runtime.camera.getWorldDirection(forward);
    const toOrigin = new THREE.Vector3().subVectors(new THREE.Vector3(0, 0, 0), runtime.camera.position).normalize();
    expect(forward.dot(toOrigin)).toBeCloseTo(1, 5);
  });

  it('coalesces multiple invalidate() calls into one rAF / main render', () => {
    const { runtime } = createRuntime();
    vi.spyOn(runtime.controls, 'update').mockReturnValue(false);
    runtime.setSize(100, 80);

    runtime.invalidate();
    runtime.invalidate();
    expect(rafQueue).toHaveLength(1);
    flushOneRaf();
    expect(mainRenderCount(runtime)).toBe(1);
    expect(rafQueue).toHaveLength(0);
  });

  it('keeps the demand loop running while controls.update returns true, then idles', () => {
    const { runtime } = createRuntime();
    const n = 3;
    let calls = 0;
    vi.spyOn(runtime.controls, 'update').mockImplementation(() => {
      calls += 1;
      return calls <= n;
    });
    runtime.setSize(100, 80);
    runtime.invalidate();

    let safety = 20;
    while (rafQueue.length > 0 && safety > 0) {
      flushOneRaf();
      safety -= 1;
    }
    expect(mainRenderCount(runtime)).toBe(n + 1);
    expect(rafQueue).toHaveLength(0);
  });

  it('does not double-schedule rAF when invalidate() runs inside a tick', () => {
    const { runtime } = createRuntime();
    let inner = false;
    vi.spyOn(runtime.controls, 'update').mockImplementation(() => {
      if (!inner) {
        inner = true;
        runtime.invalidate();
      }
      return false;
    });
    runtime.setSize(100, 80);
    runtime.invalidate();
    expect(rafQueue).toHaveLength(1);

    flushOneRaf();
    expect(mainRenderCount(runtime)).toBe(1);
    expect(rafQueue).toHaveLength(1);

    flushOneRaf();
    expect(mainRenderCount(runtime)).toBe(2);
    expect(rafQueue).toHaveLength(0);
  });

  it('skips render at zero size and flushes the remembered frame later', () => {
    const { runtime } = createRuntime();
    vi.spyOn(runtime.controls, 'update').mockReturnValue(false);

    runtime.setSize(0, 80);
    runtime.invalidate();
    expect(rafQueue).toHaveLength(0);
    expect(mainRenderCount(runtime)).toBe(0);

    runtime.setSize(120, 90);
    expect(rafQueue).toHaveLength(1);
    flushOneRaf();
    expect(mainRenderCount(runtime)).toBe(1);
  });

  it('restores autoClear, scissor test, and viewport/scissor after a gizmo overlay pass', () => {
    const { runtime, fake } = createRuntime();
    vi.spyOn(runtime.controls, 'update').mockReturnValue(false);
    runtime.setSize(320, 240);
    const viewportBefore = fake.getViewport(new THREE.Vector4()).clone();
    const scissorBefore = fake.getScissor(new THREE.Vector4()).clone();
    runtime.invalidate();
    flushOneRaf();

    expect(fake.autoClear).toBe(true);
    expect(fake.getScissorTest()).toBe(false);
    expect(fake.getViewport(new THREE.Vector4()).toArray()).toEqual(viewportBefore.toArray());
    expect(fake.getScissor(new THREE.Vector4()).toArray()).toEqual(scissorBefore.toArray());
    expect(viewportBefore.toArray()).toEqual([0, 0, 320, 240]);
    expect(mainRenderCount(runtime)).toBe(1);
  });

  it('restores GL state if the gizmo overlay render throws', () => {
    const { runtime, fake } = createRuntime();
    vi.spyOn(runtime.controls, 'update').mockReturnValue(false);
    runtime.setSize(320, 240);
    const viewportBefore = fake.getViewport(new THREE.Vector4()).clone();
    const scissorBefore = fake.getScissor(new THREE.Vector4()).clone();
    const render = fake.render as ReturnType<typeof vi.fn>;
    render.mockImplementation((scene: THREE.Object3D) => {
      if (scene !== runtime.scene) {
        throw new Error('overlay boom');
      }
    });
    runtime.invalidate();
    expect(() => flushOneRaf()).toThrow('overlay boom');
    expect(fake.autoClear).toBe(true);
    expect(fake.getScissorTest()).toBe(false);
    expect(fake.getViewport(new THREE.Vector4()).toArray()).toEqual(viewportBefore.toArray());
    expect(fake.getScissor(new THREE.Vector4()).toArray()).toEqual(scissorBefore.toArray());
  });

  it('clamps tick dt after a long idle so gizmo tween does not snap', () => {
    let now = 1_000;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const { runtime } = createRuntime();
    const update = vi.spyOn(runtime.controls, 'update').mockReturnValue(false);
    runtime.setSize(100, 80);
    now += 5_000;
    runtime.invalidate();
    flushOneRaf();
    expect(update).toHaveBeenCalledWith(1 / 30);
    nowSpy.mockRestore();
  });

  it('dispose is idempotent and loseContext calls forceContextLoss once', () => {
    const { runtime, fake } = createRuntime();
    vi.spyOn(runtime.controls, 'update').mockReturnValue(false);
    runtime.setSize(100, 80);
    runtime.invalidate();
    const pending = rafQueue.map((entry) => entry.cb);

    runtime.dispose({ loseContext: true });
    runtime.dispose({ loseContext: true });
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(fake.forceContextLoss).toHaveBeenCalledTimes(1);

    for (const cb of pending) cb(16);
    expect(mainRenderCount(runtime)).toBe(0);
    runtime.invalidate();
    expect(rafQueue).toHaveLength(0);

    const { runtime: keep, fake: fakeKeep } = createRuntime();
    keep.dispose({ loseContext: false });
    expect(fakeKeep.forceContextLoss).not.toHaveBeenCalled();
  });

  it('does not dispose contentRoot child geometry', () => {
    const { runtime } = createRuntime();
    const geometry = new THREE.BoxGeometry();
    const disposeSpy = vi.spyOn(geometry, 'dispose');
    runtime.contentRoot.add(new THREE.Mesh(geometry));
    runtime.dispose({ loseContext: false });
    expect(disposeSpy).not.toHaveBeenCalled();
  });

  it('notifies onResize once per setSize with CSS pixels', () => {
    const { runtime } = createRuntime();
    const cb = vi.fn();
    runtime.onResize(cb);
    runtime.setSize(200, 100);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ width: 200, height: 100, dpr: 1 });
    runtime.setSize(50, 25);
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
