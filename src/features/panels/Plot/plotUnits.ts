import type { TopicInfo } from '@/core/types/ros';
import { hasDerivativeModifier } from './messagePath';
import type { PlotDataset, PlotRuntimeSeries } from './types';

/** `sensor_msgs/msg/JointState` and `sensor_msgs/JointState` both normalize to `sensor_msgs/JointState`. */
function normalizeSchemaName(schema: string): string {
  return schema.replace(/\/msg\//, '/');
}

const JOINT_STATE_UNITS: Record<string, string> = {
  position: 'rad',
  velocity: 'rad/s',
  effort: 'N·m',
};

const POSE_LIKE_SCHEMAS = new Set([
  'geometry_msgs/Pose',
  'geometry_msgs/PoseStamped',
  'geometry_msgs/PoseWithCovariance',
  'geometry_msgs/PoseWithCovarianceStamped',
  'geometry_msgs/Point',
  'geometry_msgs/PointStamped',
  'geometry_msgs/Transform',
  'geometry_msgs/TransformStamped',
  'nav_msgs/Odometry',
]);

/**
 * Infer the physical unit of a plot path from the message schema, or
 * `undefined` when unknown. Joint fields assume revolute joints (the ROS
 * convention for JointState); derivative paths are left unlabeled because the
 * modifier changes the unit.
 */
export function inferPlotUnit(schemaName: string | undefined, path: string): string | undefined {
  if (!schemaName || hasDerivativeModifier(path)) return undefined;
  const schema = normalizeSchemaName(schemaName);
  const trimmed = path.trim().replace(/^\./, '');
  if (schema === 'sensor_msgs/JointState') {
    const field = /^[A-Za-z_]+/.exec(trimmed)?.[0];
    return field ? JOINT_STATE_UNITS[field] : undefined;
  }
  if (POSE_LIKE_SCHEMAS.has(schema)) {
    return /(^|\.)(position|translation)\.[xyz]\b/.test(trimmed) || /^[xyz]$/.test(trimmed)
      ? 'm'
      : undefined;
  }
  if (schema === 'geometry_msgs/Twist' || schema === 'geometry_msgs/TwistStamped') {
    if (/(^|\.)linear\.[xyz]\b/.test(trimmed)) return 'm/s';
    if (/(^|\.)angular\.[xyz]\b/.test(trimmed)) return 'rad/s';
  }
  return undefined;
}

/** Y-axis label for a set of series units: one shared unit, several joined, or none. */
export function combinePlotUnits(units: ReadonlyArray<string | undefined>): string | undefined {
  const distinct: string[] = [];
  for (const unit of units) {
    if (unit == null) return undefined;
    if (!distinct.includes(unit)) distinct.push(unit);
  }
  return distinct.length > 0 ? distinct.join(', ') : undefined;
}

interface UnitSeriesConfig {
  id: string;
  topic: string;
  path: string;
}

/**
 * Return `dataset` with per-series `unit` and the shared `yUnit` filled in.
 * The Y axis only carries a label when every series has a known unit.
 */
export function annotatePlotUnits(
  dataset: PlotDataset,
  configSeries: ReadonlyArray<UnitSeriesConfig>,
  topicByName: ReadonlyMap<string, Pick<TopicInfo, 'type'>>,
): PlotDataset {
  if (dataset.series.length === 0) return dataset;
  const byId = new Map(configSeries.map((s) => [s.id, s]));
  let changed = false;
  const series = dataset.series.map((entry): PlotRuntimeSeries => {
    const sep = entry.key.indexOf(':');
    const cfg = byId.get(sep >= 0 ? entry.key.slice(0, sep) : entry.key);
    const unit = cfg ? inferPlotUnit(topicByName.get(cfg.topic)?.type, cfg.path) : undefined;
    if (unit === entry.unit) return entry;
    changed = true;
    return { ...entry, unit };
  });
  const yUnit = combinePlotUnits(series.map((s) => s.unit));
  if (!changed && yUnit === dataset.yUnit) return dataset;
  return { ...dataset, series, yUnit };
}
