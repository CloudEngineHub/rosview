import type { JointStateField } from '../defaults';
import type { AdapterContext, DetectedPlotPath, PlotTypeAdapter } from '../schemaRegistry/types';
import { extractPlotPathValues, RECEIVE_NS_PATH } from '../messagePath';
import { discoverNumericPlotFields } from '../fieldDiscovery';

const DEFAULT_JOINT_FIELDS: JointStateField[] = ['position'];

export const jointStateAdapter: PlotTypeAdapter = {
  detect(ctx: AdapterContext): DetectedPlotPath[] {
    const fields = ctx.jointStateFields?.length ? ctx.jointStateFields : DEFAULT_JOINT_FIELDS;
    return fields.map((field) => ({ path: `${field}[:]`, label: field }));
  },
  validate(sample: unknown): boolean {
    if (!sample || typeof sample !== 'object') return false;
    const record = sample as Record<string, unknown>;
    return ['position', 'velocity', 'effort'].some((field) => {
      const arr = record[field];
      return Array.isArray(arr) && arr.length > 0;
    });
  },
};

export const LASER_SCAN_ANGLE_X_PATH = '__laser_scan_angle__';

export const laserScanAdapter: PlotTypeAdapter = {
  detect(ctx: AdapterContext): DetectedPlotPath[] {
    const suffix = ctx.schemaName?.toLowerCase() ?? '';
    if (suffix.includes('multiecho')) {
      return [{ path: 'ranges[0][:]', label: 'ranges[0]', xAxisPath: LASER_SCAN_ANGLE_X_PATH }];
    }
    return [{ path: 'ranges[:]', label: 'ranges', xAxisPath: LASER_SCAN_ANGLE_X_PATH }];
  },
  validate(sample: unknown): boolean {
    if (!sample || typeof sample !== 'object') return false;
    const ranges = (sample as Record<string, unknown>).ranges;
    return Array.isArray(ranges) && ranges.length > 0;
  },
};

export function imuPaths(): DetectedPlotPath[] {
  return [
    { path: 'linear_acceleration.x', label: 'linear_acceleration.x' },
    { path: 'linear_acceleration.y', label: 'linear_acceleration.y' },
    { path: 'linear_acceleration.z', label: 'linear_acceleration.z' },
    { path: 'angular_velocity.x', label: 'angular_velocity.x' },
    { path: 'angular_velocity.y', label: 'angular_velocity.y' },
    { path: 'angular_velocity.z', label: 'angular_velocity.z' },
  ];
}

export function magneticFieldPaths(): DetectedPlotPath[] {
  return [
    { path: 'magnetic_field.x', label: 'magnetic_field.x' },
    { path: 'magnetic_field.y', label: 'magnetic_field.y' },
    { path: 'magnetic_field.z', label: 'magnetic_field.z' },
  ];
}

export const vector3GroupAdapter: PlotTypeAdapter = {
  detect(ctx: AdapterContext): DetectedPlotPath[] {
    const suffix = ctx.schemaName?.toLowerCase().replace(/\/msg\//, '/') ?? '';
    if (suffix.endsWith('/imu')) return imuPaths();
    if (suffix.endsWith('/magneticfield')) return magneticFieldPaths();
    return [
      { path: 'x', label: 'x' },
      { path: 'y', label: 'y' },
      { path: 'z', label: 'z' },
    ];
  },
};

export const scalarAdapter: PlotTypeAdapter = {
  detect(ctx: AdapterContext): DetectedPlotPath[] {
    const suffix = ctx.schemaName?.toLowerCase().replace(/\/msg\//, '/') ?? '';
    if (suffix.endsWith('/temperature')) return [{ path: 'temperature', label: 'temperature' }];
    if (suffix.endsWith('/fluidpressure')) return [{ path: 'fluid_pressure', label: 'fluid_pressure' }];
    if (suffix.endsWith('/illuminance')) return [{ path: 'illuminance', label: 'illuminance' }];
    if (suffix.endsWith('/relativehumidity')) return [{ path: 'relative_humidity', label: 'relative_humidity' }];
    if (suffix.endsWith('/range')) return [{ path: 'range', label: 'range' }];
    return [{ path: 'data', label: 'data' }];
  },
};

export const scalarGroupAdapter: PlotTypeAdapter = {
  detect(): DetectedPlotPath[] {
    return [
      { path: 'latitude', label: 'latitude' },
      { path: 'longitude', label: 'longitude' },
      { path: 'altitude', label: 'altitude' },
    ];
  },
};

/** Series auto-selected from a decoded msgpack payload; the rest stay in the field picker. */
const MSGPACK_DEFAULT_SERIES = 3;
/** Sequence counters and nanosecond stamps dwarf real signals on a shared axis. */
const MSGPACK_BOOKKEEPING_RE = /(^|[._])(seq|idx|ns)$|_(seq|idx|ns)$/;

/** Stamps closer than this are assumed to share a clock (a monotonic uptime vs. a Unix epoch differ by decades). */
const SAME_CLOCK_MAX_GAP_NS = 60e9;
/** Unix-epoch nanoseconds after 2001; comparable with the message receive (log) time. */
const EPOCH_NS_MIN = 1e18;

/**
 * Pipeline latency curves (ms) between the `*_ns` stamps of a msgpack payload:
 * consecutive stages on the same clock plus the end-to-end span, and receive
 * time minus any wall-clock stamp.
 */
export function msgpackLatencyPaths(payload: Record<string, unknown>): DetectedPlotPath[] {
  const stamps = Object.entries(payload)
    .filter((entry): entry is [string, number] => entry[0].endsWith('_ns') && typeof entry[1] === 'number')
    .sort((a, b) => a[1] - b[1]);
  const short = (key: string) => key.replace(/_ns$/, '');
  const latency = (later: string, earlier: string): DetectedPlotPath => ({
    path: `${later === RECEIVE_NS_PATH ? later : `msgpack.${later}`}@sub(msgpack.${earlier})@ns2ms`,
    label: `${later === RECEIVE_NS_PATH ? 'receive' : short(later)} − ${short(earlier)}`,
  });

  const out: DetectedPlotPath[] = [];
  let group: Array<[string, number]> = [];
  const flush = () => {
    for (let i = 1; i < group.length; i++) out.push(latency(group[i][0], group[i - 1][0]));
    if (group.length > 2) out.push(latency(group.at(-1)![0], group[0][0]));
    group = [];
  };
  for (const stamp of stamps) {
    const last = group.at(-1);
    if (last && stamp[1] - last[1] > SAME_CLOCK_MAX_GAP_NS) flush();
    group.push(stamp);
  }
  flush();
  for (const [key, value] of stamps) {
    if (value >= EPOCH_NS_MIN) out.push(latency(RECEIVE_NS_PATH, key));
  }
  return out;
}

export const multiArrayAdapter: PlotTypeAdapter = {
  detect(ctx: AdapterContext): DetectedPlotPath[] {
    const payload = (ctx.sample as { msgpack?: unknown } | undefined)?.msgpack;
    if (payload && typeof payload === 'object') {
      let defaults = 0;
      const fields: DetectedPlotPath[] = discoverNumericPlotFields(payload).map((field) => {
        const isDefault = defaults < MSGPACK_DEFAULT_SERIES && !MSGPACK_BOOKKEEPING_RE.test(field.label);
        if (isDefault) defaults++;
        return { path: `msgpack.${field.path}`, label: field.label, default: isDefault };
      });
      // Latency curves are opt-in unless the payload carries nothing but bookkeeping stamps.
      const latency = msgpackLatencyPaths(payload as Record<string, unknown>).map((entry) => ({
        ...entry,
        default: defaults === 0,
      }));
      return [...fields, ...latency];
    }
    return [{ path: 'data[:]', label: 'data' }];
  },
};

/** Per-motor fields of low-level motor state / command arrays, in display order. */
const MOTOR_FIELDS = ['q', 'dq', 'ddq', 'tau_est', 'tau', 'kp', 'kd', 'temperature', 'lost'];
const IMU_VECTORS = ['rpy', 'gyro', 'acc'];

interface MotorAdapterLayout {
  /** Motor array plotted by default (joint space). */
  primary: string;
  arrays: string[];
  fields: string[];
  imu?: string;
}

function motorArraysInSample(sample: unknown): string[] {
  if (!sample || typeof sample !== 'object') return [];
  return Object.entries(sample as Record<string, unknown>)
    .filter(([, value]) => {
      const first: unknown = Array.isArray(value) ? value[0] : undefined;
      return first != null && typeof first === 'object' && typeof (first as { q?: unknown }).q === 'number';
    })
    .map(([key]) => key);
}

/**
 * Robot low-level state/command messages (e.g. `booster_interface/LowState`):
 * arrays of per-motor records with `q`/`dq`/`tau…` plus an optional IMU block.
 * Structure is read from the sample when available; `fallback` covers detection
 * before the first message arrives.
 */
function motorLayout(sample: unknown, fallback: MotorAdapterLayout): MotorAdapterLayout {
  const arrays = motorArraysInSample(sample);
  if (arrays.length === 0) return fallback;
  const record = sample as Record<string, unknown>;
  const firstMotor = (record[arrays[0]] as Array<Record<string, unknown>>)[0];
  const imuState = record.imu_state;
  return {
    // Serial = joint space; parallel = actuator space of linkage joints (Booster naming).
    primary: arrays.find((name) => name.endsWith('_serial')) ?? arrays[0],
    arrays,
    fields: MOTOR_FIELDS.filter((field) => typeof firstMotor[field] === 'number'),
    imu: imuState && typeof imuState === 'object' ? 'imu_state' : undefined,
  };
}

function motorPaths(layout: MotorAdapterLayout): DetectedPlotPath[] {
  const arrays = [layout.primary, ...layout.arrays.filter((name) => name !== layout.primary)];
  const out: DetectedPlotPath[] = [];
  for (const array of arrays) {
    for (const field of layout.fields) {
      out.push({
        path: `${array}[:].${field}`,
        label: `${array}.${field}`,
        default: array === layout.primary && field === 'q',
      });
    }
  }
  if (layout.imu) {
    for (const vector of IMU_VECTORS) {
      out.push({ path: `${layout.imu}.${vector}[:]`, label: `${layout.imu}.${vector}`, default: false });
    }
  }
  return out;
}

export const lowStateAdapter: PlotTypeAdapter = {
  detect(ctx: AdapterContext): DetectedPlotPath[] {
    return motorPaths(
      motorLayout(ctx.sample, {
        primary: 'motor_state_serial',
        arrays: ['motor_state_serial', 'motor_state_parallel'],
        fields: ['q', 'dq', 'ddq', 'tau_est', 'temperature', 'lost'],
        imu: 'imu_state',
      }),
    );
  },
};

export const lowCmdAdapter: PlotTypeAdapter = {
  detect(ctx: AdapterContext): DetectedPlotPath[] {
    return motorPaths(
      motorLayout(ctx.sample, {
        primary: 'motor_cmd',
        arrays: ['motor_cmd'],
        fields: ['q', 'dq', 'tau', 'kp', 'kd'],
      }),
    );
  },
};

export const numericArrayAdapter: PlotTypeAdapter = {
  detect(ctx: AdapterContext): DetectedPlotPath[] {
    const suffix = ctx.schemaName?.toLowerCase().replace(/\/msg\//, '/') ?? '';
    if (suffix.endsWith('/joy')) {
      return [{ path: 'axes[:]', label: 'axes' }];
    }
    if (suffix.endsWith('/channelfloat32')) {
      return [{ path: 'values[:]', label: 'values' }];
    }
    return [{ path: 'data[:]', label: 'data' }];
  },
};

export const batteryStateAdapter: PlotTypeAdapter = {
  detect(): DetectedPlotPath[] {
    return [
      { path: 'percentage', label: 'percentage' },
      { path: 'voltage', label: 'voltage' },
    ];
  },
};

export const twistAdapter: PlotTypeAdapter = {
  detect(ctx: AdapterContext): DetectedPlotPath[] {
    const suffix = ctx.schemaName?.toLowerCase().replace(/\/msg\//, '/') ?? '';
    const prefix = suffix.endsWith('/twiststamped') ? 'twist.' : '';
    return [
      { path: `${prefix}linear.x`, label: 'linear.x' },
      { path: `${prefix}linear.y`, label: 'linear.y' },
      { path: `${prefix}angular.z`, label: 'angular.z' },
    ];
  },
};

export const poseAdapter: PlotTypeAdapter = {
  detect(ctx: AdapterContext): DetectedPlotPath[] {
    const suffix = ctx.schemaName?.toLowerCase().replace(/\/msg\//, '/') ?? '';
    if (suffix.endsWith('/pointstamped')) {
      return [
        { path: 'point.x', label: 'point.x' },
        { path: 'point.y', label: 'point.y' },
        { path: 'point.z', label: 'point.z' },
      ];
    }
    const prefix = suffix.endsWith('/posestamped') ? 'pose.' : '';
    return [
      { path: `${prefix}position.x`, label: 'position.x' },
      { path: `${prefix}position.y`, label: 'position.y' },
      { path: `${prefix}position.z`, label: 'position.z' },
    ];
  },
};

export const wrenchAdapter: PlotTypeAdapter = {
  detect(ctx: AdapterContext): DetectedPlotPath[] {
    const suffix = ctx.schemaName?.toLowerCase().replace(/\/msg\//, '/') ?? '';
    const prefix = suffix.endsWith('/wrenchstamped') ? 'wrench.' : '';
    return [
      { path: `${prefix}force.x`, label: 'force.x' },
      { path: `${prefix}force.y`, label: 'force.y' },
      { path: `${prefix}force.z`, label: 'force.z' },
    ];
  },
};

export const odometryAdapter: PlotTypeAdapter = {
  detect(): DetectedPlotPath[] {
    return [
      { path: 'pose.pose.position.x', label: 'position.x' },
      { path: 'pose.pose.position.y', label: 'position.y' },
      { path: 'twist.twist.linear.x', label: 'linear.x' },
    ];
  },
};

export const tfMessageAdapter: PlotTypeAdapter = {
  detect(): DetectedPlotPath[] {
    return [
      { path: 'transforms[:].transform.translation.x', label: 'translation.x' },
      { path: 'transforms[:].transform.translation.y', label: 'translation.y' },
      { path: 'transforms[:].transform.translation.z', label: 'translation.z' },
      { path: 'transforms[:].transform.rotation.x', label: 'rotation.x', default: false },
      { path: 'transforms[:].transform.rotation.y', label: 'rotation.y', default: false },
      { path: 'transforms[:].transform.rotation.z', label: 'rotation.z', default: false },
      { path: 'transforms[:].transform.rotation.w', label: 'rotation.w', default: false },
    ];
  },
  validate(sample: unknown): boolean {
    if (!sample || typeof sample !== 'object') return false;
    const transforms = (sample as Record<string, unknown>).transforms;
    if (!Array.isArray(transforms) || transforms.length === 0) return false;

    return transforms.some((item) => {
      if (!item || typeof item !== 'object') return false;
      const transform = (item as Record<string, unknown>).transform;
      if (!transform || typeof transform !== 'object') return false;
      const translation = (transform as Record<string, unknown>).translation;
      if (!translation || typeof translation !== 'object') return false;
      return ['x', 'y', 'z'].some((axis) => {
        const value = (translation as Record<string, unknown>)[axis];
        return typeof value === 'number' && Number.isFinite(value);
      });
    });
  },
};

export function validateDetectedPaths(sample: unknown, paths: DetectedPlotPath[]): DetectedPlotPath[] {
  if (!sample) return paths;
  return paths.filter((entry) => {
    if (entry.xAxisPath === LASER_SCAN_ANGLE_X_PATH) {
      return laserScanAdapter.validate?.(sample) ?? false;
    }
    // Placeholder receive time: `$receive_ns` paths are valid whenever their other operand resolves.
    return extractPlotPathValues(sample, entry.path, { receiveTime: { sec: 0, nsec: 0 } }).length > 0;
  });
}
