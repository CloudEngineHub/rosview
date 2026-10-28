import { describe, expect, it } from 'vitest';
import { decodeRawImage } from './rawDecoders';

describe('decodeRawImage', () => {
  it('decodes rgb8 into rgba', () => {
    const output = new Uint8ClampedArray(8);
    decodeRawImage(
      {
        encoding: 'rgb8',
        width: 2,
        height: 1,
        data: new Uint8Array([255, 0, 0, 0, 255, 0]),
      },
      output,
    );

    expect(Array.from(output)).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  });

  it('decodes mono8 into grayscale rgba', () => {
    const output = new Uint8ClampedArray(8);
    decodeRawImage(
      {
        encoding: 'mono8',
        width: 2,
        height: 1,
        data: new Uint8Array([0, 255]),
      },
      output,
    );

    expect(Array.from(output)).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
  });

  it('decodes 16uc1 using default depth colormap range when maxValue is omitted', () => {
    const output = new Uint8ClampedArray(4);
    decodeRawImage(
      {
        encoding: '16UC1',
        width: 1,
        height: 1,
        data: new Uint8Array([0x00, 0x00]),
      },
      output,
      { colorMode: 'colormap', colorMap: 'turbo' },
    );

    expect(output[2]).toBeGreaterThan(output[1]);
    expect(output[3]).toBe(255);
  });

  it('decodes 16uc1 using grayscale normalization', () => {
    const output = new Uint8ClampedArray(4);
    decodeRawImage(
      {
        encoding: '16UC1',
        width: 1,
        height: 1,
        data: new Uint8Array([0x88, 0x13]),
      },
      output,
      { minValue: 0, maxValue: 10000, colorMode: 'colormap', colorMap: 'turbo' },
    );

    // Turbo at ~50% depth is not grayscale; assert visible color + opaque alpha.
    expect(output[0] + output[1] + output[2]).toBeGreaterThan(80);
    expect(output[3]).toBe(255);
  });

  it('treats 32fc1 depth stored in millimeters with the millimeter range when unset', () => {
    const decode = (depth: number, options?: { minValue?: number; maxValue?: number }) => {
      const data = new Uint8Array(4 * 4);
      const view = new DataView(data.buffer);
      for (let i = 0; i < 4; i++) view.setFloat32(i * 4, depth, true);
      const output = new Uint8ClampedArray(16);
      decodeRawImage({ encoding: '32FC1', width: 4, height: 1, data }, output, options);
      return Array.from(output.subarray(0, 4));
    };

    // Millimeter data with no explicit range decodes exactly like the 200–10000 mm preset, not saturated.
    const mm = decode(2500);
    expect(mm).toEqual(decode(2500, { minValue: 200, maxValue: 10000 }));
    expect(mm).not.toEqual(decode(1e6, { minValue: 200, maxValue: 10000 }));
    // Meter data keeps the existing 0–1 default.
    expect(decode(0.5)).toEqual(decode(0.5, { minValue: 0, maxValue: 1 }));
  });

  it('decodes neutral nv12 chroma to grayscale', () => {
    const output = new Uint8ClampedArray(16);
    decodeRawImage(
      {
        encoding: 'nv12',
        width: 2,
        height: 2,
        // Y plane (2x2) + one UV pair
        data: new Uint8Array([0, 64, 128, 255, 128, 128]),
      },
      output,
    );

    expect(Array.from(output)).toEqual([0, 0, 0, 255, 64, 64, 64, 255, 128, 128, 128, 255, 255, 255, 255, 255]);
  });

  it('decodes nv12 chroma and swaps it for nv21', () => {
    const nv12 = new Uint8ClampedArray(16);
    const nv21 = new Uint8ClampedArray(16);
    const y = [100, 100, 100, 100];
    decodeRawImage({ encoding: 'NV12', width: 2, height: 2, data: new Uint8Array([...y, 90, 200]) }, nv12);
    decodeRawImage({ encoding: 'nv21', width: 2, height: 2, data: new Uint8Array([...y, 200, 90]) }, nv21);

    // V=200 pushes red up and blue down for every pixel sharing the chroma pair.
    expect(Array.from(nv12.subarray(0, 4))).toEqual([201, 62, 33, 255]);
    expect(Array.from(nv21)).toEqual(Array.from(nv12));
  });

  it('decodes nv12 with padded rows and odd width', () => {
    const output = new Uint8ClampedArray(3 * 3 * 4);
    // width 3, height 3, step 4: Y rows then ceil(3/2)=2 UV rows, all neutral chroma
    const data = new Uint8Array([
      10, 20, 30, 0,
      40, 50, 60, 0,
      70, 80, 90, 0,
      128, 128, 128, 128,
      128, 128, 128, 128,
    ]);
    decodeRawImage({ encoding: 'nv12', width: 3, height: 3, step: 4, data }, output);

    const grays = [];
    for (let i = 0; i < output.length; i += 4) grays.push(output[i]);
    expect(grays).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90]);
  });

  it('throws when nv12 data is truncated', () => {
    const output = new Uint8ClampedArray(16);
    expect(() =>
      decodeRawImage({ encoding: 'nv12', width: 2, height: 2, data: new Uint8Array(4) }, output),
    ).toThrow(/NV12 image data/);
  });

  it('throws on unsupported encoding', () => {
    const output = new Uint8ClampedArray(4);
    expect(() =>
      decodeRawImage(
        {
          encoding: 'unknown',
          width: 1,
          height: 1,
          data: new Uint8Array([0]),
        },
        output,
      ),
    ).toThrow(/Unsupported image encoding/);
  });
});
