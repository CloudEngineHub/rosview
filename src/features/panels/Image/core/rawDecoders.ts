import {
  DEFAULT_RAW_IMAGE_DECODE_OPTIONS,
  getColorConverter,
  type ColorRGBA,
  type RawImageDecodeOptions,
} from './imageColorMode';
import {
  DEFAULT_DEPTH_16UC1_COLOR_MAX,
  DEFAULT_DEPTH_16UC1_COLOR_MIN,
  resolveDepthColorRange,
} from './depthColorDefaults';

export interface RawImageLike {
  encoding: string;
  width: number;
  height: number;
  step?: number;
  is_bigendian?: boolean;
  data: Uint8Array;
}

function yuvToRGBA8(
  y1: number,
  u: number,
  y2: number,
  v: number,
  offset: number,
  output: Uint8ClampedArray,
): void {
  output[offset] = y1 + Math.trunc((1403 * v) / 1000);
  output[offset + 1] = y1 - Math.trunc((344 * u) / 1000) - Math.trunc((714 * v) / 1000);
  output[offset + 2] = y1 + Math.trunc((1770 * u) / 1000);
  output[offset + 3] = 255;

  output[offset + 4] = y2 + Math.trunc((1403 * v) / 1000);
  output[offset + 5] = y2 - Math.trunc((344 * u) / 1000) - Math.trunc((714 * v) / 1000);
  output[offset + 6] = y2 + Math.trunc((1770 * u) / 1000);
  output[offset + 7] = 255;
}

function decodeUYVY(
  input: Uint8Array,
  width: number,
  height: number,
  step: number,
  output: Uint8ClampedArray,
): void {
  if (step < width * 2) {
    throw new Error(`UYVY image row step (${step}) must be at least 2*width (${width * 2})`);
  }

  let outIdx = 0;
  for (let row = 0; row < height; row++) {
    const rowStart = row * step;
    for (let col = 0; col < width; col += 2) {
      const off = rowStart + col * 2;
      const u = input[off] - 128;
      const y1 = input[off + 1];
      const v = input[off + 2] - 128;
      const y2 = input[off + 3];
      yuvToRGBA8(y1, u, y2, v, outIdx, output);
      outIdx += 8;
    }
  }
}

function decodeYUYV(
  input: Uint8Array,
  width: number,
  height: number,
  step: number,
  output: Uint8ClampedArray,
): void {
  if (step < width * 2) {
    throw new Error(`YUYV image row step (${step}) must be at least 2*width (${width * 2})`);
  }

  let outIdx = 0;
  for (let row = 0; row < height; row++) {
    const rowStart = row * step;
    for (let col = 0; col < width; col += 2) {
      const off = rowStart + col * 2;
      const y1 = input[off];
      const u = input[off + 1] - 128;
      const y2 = input[off + 2];
      const v = input[off + 3] - 128;
      yuvToRGBA8(y1, u, y2, v, outIdx, output);
      outIdx += 8;
    }
  }
}

/**
 * Semi-planar 4:2:0: a full-resolution Y plane followed by a half-height plane of
 * interleaved chroma pairs (UV for NV12, VU for NV21), both using `step` as row stride.
 */
function decodeNV12(
  input: Uint8Array,
  width: number,
  height: number,
  step: number,
  output: Uint8ClampedArray,
  swapUV: boolean,
): void {
  const name = swapUV ? 'NV21' : 'NV12';
  if (step < width) {
    throw new Error(`${name} image row step (${step}) must be at least width (${width})`);
  }
  const uvBase = step * height;
  const expected = uvBase + step * Math.ceil(height / 2);
  if (input.length < expected) {
    throw new Error(`${name} image data (${input.length} bytes) is shorter than expected (${expected})`);
  }
  const uOffset = swapUV ? 1 : 0;
  const vOffset = swapUV ? 0 : 1;

  let outIdx = 0;
  for (let row = 0; row < height; row++) {
    const yRow = row * step;
    const uvRow = uvBase + (row >> 1) * step;
    for (let col = 0; col < width; col++) {
      const uvIdx = uvRow + (col & ~1);
      const y = input[yRow + col];
      const u = input[uvIdx + uOffset] - 128;
      const v = input[uvIdx + vOffset] - 128;
      output[outIdx++] = y + Math.trunc((1403 * v) / 1000);
      output[outIdx++] = y - Math.trunc((344 * u) / 1000) - Math.trunc((714 * v) / 1000);
      output[outIdx++] = y + Math.trunc((1770 * u) / 1000);
      output[outIdx++] = 255;
    }
  }
}

function decodeRGB8(
  input: Uint8Array,
  width: number,
  height: number,
  step: number,
  output: Uint8ClampedArray,
): void {
  if (step < width * 3) {
    throw new Error(`RGB8 image row step (${step}) must be at least 3*width (${width * 3})`);
  }

  let outIdx = 0;
  for (let row = 0; row < height; row++) {
    const rowStart = row * step;
    for (let col = 0; col < width; col++) {
      const inIdx = rowStart + col * 3;
      output[outIdx++] = input[inIdx]!;
      output[outIdx++] = input[inIdx + 1]!;
      output[outIdx++] = input[inIdx + 2]!;
      output[outIdx++] = 255;
    }
  }
}

function decodeRGBA8(
  input: Uint8Array,
  width: number,
  height: number,
  step: number,
  output: Uint8ClampedArray,
): void {
  if (step < width * 4) {
    throw new Error(`RGBA8 image row step (${step}) must be at least 4*width (${width * 4})`);
  }

  let outIdx = 0;
  for (let row = 0; row < height; row++) {
    const rowStart = row * step;
    for (let col = 0; col < width; col++) {
      const inIdx = rowStart + col * 4;
      output[outIdx++] = input[inIdx]!;
      output[outIdx++] = input[inIdx + 1]!;
      output[outIdx++] = input[inIdx + 2]!;
      output[outIdx++] = input[inIdx + 3]!;
    }
  }
}

function decodeBGRA8(
  input: Uint8Array,
  width: number,
  height: number,
  step: number,
  output: Uint8ClampedArray,
): void {
  if (step < width * 4) {
    throw new Error(`BGRA8 image row step (${step}) must be at least 4*width (${width * 4})`);
  }

  let outIdx = 0;
  for (let row = 0; row < height; row++) {
    const rowStart = row * step;
    for (let col = 0; col < width; col++) {
      const inIdx = rowStart + col * 4;
      output[outIdx++] = input[inIdx + 2]!;
      output[outIdx++] = input[inIdx + 1]!;
      output[outIdx++] = input[inIdx]!;
      output[outIdx++] = input[inIdx + 3]!;
    }
  }
}

function decodeBGR8(
  input: Uint8Array,
  width: number,
  height: number,
  step: number,
  output: Uint8ClampedArray,
): void {
  if (step < width * 3) {
    throw new Error(`BGR8 image row step (${step}) must be at least 3*width (${width * 3})`);
  }

  let outIdx = 0;
  for (let row = 0; row < height; row++) {
    const rowStart = row * step;
    for (let col = 0; col < width; col++) {
      const inIdx = rowStart + col * 3;
      output[outIdx++] = input[inIdx + 2]!;
      output[outIdx++] = input[inIdx + 1]!;
      output[outIdx++] = input[inIdx]!;
      output[outIdx++] = 255;
    }
  }
}

function decodeFloat1c(
  input: Uint8Array,
  width: number,
  height: number,
  step: number,
  isBigEndian: boolean,
  output: Uint8ClampedArray,
  colorOpts: RawImageDecodeOptions,
): void {
  if (step < width * 4) {
    throw new Error(`Float image row step (${step}) must be at least 4*width (${width * 4})`);
  }

  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const { minValue: minV, maxValue: maxV } =
    colorOpts.minValue == null && colorOpts.maxValue == null && isMillimeterFloatDepth(view, width, height, step, isBigEndian)
      ? { minValue: DEFAULT_DEPTH_16UC1_COLOR_MIN, maxValue: DEFAULT_DEPTH_16UC1_COLOR_MAX }
      : resolveDepthColorRange('32fc1', colorOpts);
  let converter;
  try {
    converter = getColorConverter(colorOpts, minV, maxV);
  } catch {
    converter = getColorConverter(
      { ...DEFAULT_RAW_IMAGE_DECODE_OPTIONS, colorMode: 'gradient' },
      minV,
      maxV,
    );
  }
  const px: ColorRGBA = { r: 0, g: 0, b: 0, a: 0 };

  let outIdx = 0;
  for (let row = 0; row < height; row++) {
    const rowStart = row * step;
    for (let col = 0; col < width; col++) {
      const raw = view.getFloat32(rowStart + col * 4, !isBigEndian);
      converter(px, raw);
      output[outIdx++] = Math.round(clamp01(px.r) * 255);
      output[outIdx++] = Math.round(clamp01(px.g) * 255);
      output[outIdx++] = Math.round(clamp01(px.b) * 255);
      output[outIdx++] = Math.round(clamp01(px.a) * 255);
    }
  }
}

/** Median valid depth above this is taken as millimeters (no indoor scene sits 50 m away). */
const FLOAT_DEPTH_MM_MEDIAN_THRESHOLD = 50;
const FLOAT_DEPTH_SAMPLE_COUNT = 1024;

/**
 * REP-117 says 32FC1 depth is meters, but some drivers publish millimeters as float.
 * Sample the frame and compare the median of valid (finite, positive) depths.
 */
function isMillimeterFloatDepth(
  view: DataView,
  width: number,
  height: number,
  step: number,
  isBigEndian: boolean,
): boolean {
  const total = width * height;
  if (total === 0) return false;
  const stride = Math.max(1, Math.floor(total / FLOAT_DEPTH_SAMPLE_COUNT));
  const samples: number[] = [];
  for (let i = 0; i < total; i += stride) {
    const row = Math.floor(i / width);
    const col = i - row * width;
    const value = view.getFloat32(row * step + col * 4, !isBigEndian);
    if (Number.isFinite(value) && value > 0) samples.push(value);
  }
  if (samples.length === 0) return false;
  samples.sort((a, b) => a - b);
  return samples[samples.length >> 1] > FLOAT_DEPTH_MM_MEDIAN_THRESHOLD;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function decodeMono8(
  input: Uint8Array,
  width: number,
  height: number,
  step: number,
  output: Uint8ClampedArray,
): void {
  if (step < width) {
    throw new Error(`Mono8 image row step (${step}) must be at least width (${width})`);
  }

  let outIdx = 0;
  for (let row = 0; row < height; row++) {
    const rowStart = row * step;
    for (let col = 0; col < width; col++) {
      const value = input[rowStart + col];
      output[outIdx++] = value;
      output[outIdx++] = value;
      output[outIdx++] = value;
      output[outIdx++] = 255;
    }
  }
}

function decodeMono16(
  input: Uint8Array,
  width: number,
  height: number,
  step: number,
  isBigEndian: boolean,
  output: Uint8ClampedArray,
  colorOpts: RawImageDecodeOptions,
  encoding: string,
): void {
  if (step < width * 2) {
    throw new Error(`Mono16 image row step (${step}) must be at least 2*width (${width * 2})`);
  }

  const { minValue, maxValue } = resolveDepthColorRange(encoding, colorOpts);
  let converter;
  try {
    converter = getColorConverter(colorOpts, minValue, maxValue);
  } catch {
    converter = getColorConverter(
      { ...DEFAULT_RAW_IMAGE_DECODE_OPTIONS, colorMode: 'gradient' },
      minValue,
      maxValue,
    );
  }
  const px: ColorRGBA = { r: 0, g: 0, b: 0, a: 0 };

  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  let outIdx = 0;
  for (let row = 0; row < height; row++) {
    const rowStart = row * step;
    for (let col = 0; col < width; col++) {
      const value = view.getUint16(rowStart + col * 2, !isBigEndian);
      converter(px, value);
      output[outIdx++] = Math.round(clamp01(px.r) * 255);
      output[outIdx++] = Math.round(clamp01(px.g) * 255);
      output[outIdx++] = Math.round(clamp01(px.b) * 255);
      output[outIdx++] = Math.round(clamp01(px.a) * 255);
    }
  }
}

function makeSpecializedDecodeBayer(
  tl: string,
  tr: string,
  bl: string,
  br: string,
): (
  data: Uint8Array,
  width: number,
  height: number,
  step: number,
  output: Uint8ClampedArray,
) => void {
  // Specialized per-pattern decoders; dynamic body is data-only (tl/tr/bl/br captured in closure scope).
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- Bayer decode hot path uses parameterized Function template
  return new Function(
    'data',
    'width',
    'height',
    'step',
    'output',
    `
      if (step < width) {
        throw new Error(\`Bayer image row step (\${step}) must be at least width (\${width})\`);
      }
      for (let i = 0; i < height / 2; i++) {
        let inIdx = i * 2 * step;
        let outTopIdx = i * 2 * width * 4;
        let outBottomIdx = (i * 2 + 1) * width * 4;
        for (let j = 0; j < width / 2; j++) {
          const tl = data[inIdx++];
          const tr = data[inIdx++];
          const bl = data[inIdx + step - 2];
          const br = data[inIdx + step - 1];

          const ${tl} = tl;
          const ${tr} = tr;
          const ${bl} = bl;
          const ${br} = br;

          output[outTopIdx++] = r;
          output[outTopIdx++] = g0;
          output[outTopIdx++] = b;
          output[outTopIdx++] = 255;
          output[outTopIdx++] = r;
          output[outTopIdx++] = g0;
          output[outTopIdx++] = b;
          output[outTopIdx++] = 255;

          output[outBottomIdx++] = r;
          output[outBottomIdx++] = g1;
          output[outBottomIdx++] = b;
          output[outBottomIdx++] = 255;
          output[outBottomIdx++] = r;
          output[outBottomIdx++] = g1;
          output[outBottomIdx++] = b;
          output[outBottomIdx++] = 255;
        }
      }
    `,
  ) as (
    data: Uint8Array,
    width: number,
    height: number,
    step: number,
    output: Uint8ClampedArray,
  ) => void;
}

const decodeBayerRGGB8 = makeSpecializedDecodeBayer('r', 'g0', 'g1', 'b');
const decodeBayerBGGR8 = makeSpecializedDecodeBayer('b', 'g0', 'g1', 'r');
const decodeBayerGBRG8 = makeSpecializedDecodeBayer('g0', 'b', 'r', 'g1');
const decodeBayerGRBG8 = makeSpecializedDecodeBayer('g0', 'r', 'b', 'g1');

function normalizedEncoding(encoding: string): string {
  return encoding.trim().toLowerCase();
}

export function decodeRawImage(
  image: RawImageLike,
  output: Uint8ClampedArray,
  options?: Partial<RawImageDecodeOptions>,
): void {
  const width = image.width;
  const height = image.height;
  const step = image.step ?? inferStep(image);
  const isBigEndian = image.is_bigendian ?? false;
  const encoding = normalizedEncoding(image.encoding);
  const data = image.data;
  const colorOpts: RawImageDecodeOptions = {
    ...DEFAULT_RAW_IMAGE_DECODE_OPTIONS,
    ...options,
  };

  switch (encoding) {
    case 'rgb8':
      decodeRGB8(data, width, height, step, output);
      return;
    case 'rgba8':
      decodeRGBA8(data, width, height, step, output);
      return;
    case 'bgra8':
      decodeBGRA8(data, width, height, step, output);
      return;
    case 'bgr8':
    case '8uc3':
      decodeBGR8(data, width, height, step, output);
      return;
    case 'mono8':
    case '8uc1':
      decodeMono8(data, width, height, step, output);
      return;
    case 'mono16':
    case '16uc1':
      decodeMono16(data, width, height, step, isBigEndian, output, colorOpts, encoding);
      return;
    case '32fc1':
      decodeFloat1c(data, width, height, step, isBigEndian, output, colorOpts);
      return;
    case 'uyvy':
    case 'yuv422':
      decodeUYVY(data, width, height, step, output);
      return;
    case 'yuyv':
    case 'yuv422_yuy2':
      decodeYUYV(data, width, height, step, output);
      return;
    case 'nv12':
      decodeNV12(data, width, height, step, output, false);
      return;
    case 'nv21':
      decodeNV12(data, width, height, step, output, true);
      return;
    case 'bayer_rggb8':
      decodeBayerRGGB8(data, width, height, step, output);
      return;
    case 'bayer_bggr8':
      decodeBayerBGGR8(data, width, height, step, output);
      return;
    case 'bayer_gbrg8':
      decodeBayerGBRG8(data, width, height, step, output);
      return;
    case 'bayer_grbg8':
      decodeBayerGRBG8(data, width, height, step, output);
      return;
    default:
      throw new Error(`Unsupported image encoding: ${image.encoding}`);
  }
}

function inferStep(image: RawImageLike): number {
  const encoding = normalizedEncoding(image.encoding);

  switch (encoding) {
    case 'rgb8':
    case 'bgr8':
    case '8uc3':
      return image.width * 3;
    case 'rgba8':
    case 'bgra8':
    case '32fc1':
      return image.width * 4;
    case 'uyvy':
    case 'yuyv':
    case 'yuv422':
    case 'yuv422_yuy2':
      return image.width * 2;
    case 'mono16':
    case '16uc1':
      return image.width * 2;
    case 'mono8':
    case '8uc1':
    case 'nv12':
    case 'nv21':
    case 'bayer_rggb8':
    case 'bayer_bggr8':
    case 'bayer_gbrg8':
    case 'bayer_grbg8':
      return image.width;
    default:
      return image.width * 4;
  }
}
