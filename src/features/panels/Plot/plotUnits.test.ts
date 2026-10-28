import { describe, expect, it } from 'vitest';
import { annotatePlotUnits, combinePlotUnits, inferPlotUnit } from './plotUnits';
import type { PlotDataset } from './types';

describe('inferPlotUnit', () => {
  it('maps JointState fields', () => {
    expect(inferPlotUnit('sensor_msgs/msg/JointState', 'position[:]')).toBe('rad');
    expect(inferPlotUnit('sensor_msgs/JointState', 'velocity[0]')).toBe('rad/s');
    expect(inferPlotUnit('sensor_msgs/JointState', 'effort[:]')).toBe('N·m');
  });
  it('maps pose positions and twists', () => {
    expect(inferPlotUnit('geometry_msgs/PoseStamped', 'pose.position.x')).toBe('m');
    expect(inferPlotUnit('geometry_msgs/PoseStamped', 'pose.orientation.w')).toBeUndefined();
    expect(inferPlotUnit('geometry_msgs/Twist', 'linear.x')).toBe('m/s');
    expect(inferPlotUnit('geometry_msgs/Twist', 'angular.z')).toBe('rad/s');
  });
  it('is unknown for other schemas and derivatives', () => {
    expect(inferPlotUnit('std_msgs/Float32', 'data')).toBeUndefined();
    expect(inferPlotUnit(undefined, 'position[:]')).toBeUndefined();
    expect(inferPlotUnit('sensor_msgs/JointState', 'position[0]@derivative')).toBeUndefined();
  });
});

describe('inferPlotUnit for robot low-level and latency paths', () => {
  it('labels Booster LowState / LowCmd motor and IMU fields', () => {
    expect(inferPlotUnit('booster_interface/msg/LowState', 'motor_state_serial[:].q')).toBe('rad');
    expect(inferPlotUnit('booster_interface/msg/LowState', 'motor_state_serial[:].tau_est')).toBe('N·m');
    expect(inferPlotUnit('booster_interface/msg/LowState', 'motor_state_serial[:].temperature')).toBe('°C');
    expect(inferPlotUnit('booster_interface/msg/LowState', 'imu_state.acc[:]')).toBe('m/s²');
    expect(inferPlotUnit('booster_interface/msg/LowCmd', 'motor_cmd[:].kp')).toBeUndefined();
    expect(inferPlotUnit('booster_interface/msg/LowState', 'motor_state_serial[:].q@rad2deg')).toBeUndefined();
  });

  it('labels stamp differences as milliseconds', () => {
    expect(inferPlotUnit('std_msgs/msg/ByteMultiArray', 'msgpack.a_ns@sub(msgpack.b_ns)@ns2ms')).toBe('ms');
  });
});

describe('combinePlotUnits', () => {
  it('joins distinct units and drops the label when any is unknown', () => {
    expect(combinePlotUnits(['rad', 'rad'])).toBe('rad');
    expect(combinePlotUnits(['rad', 'rad/s'])).toBe('rad, rad/s');
    expect(combinePlotUnits(['rad', undefined])).toBeUndefined();
    expect(combinePlotUnits([])).toBeUndefined();
  });
});

describe('annotatePlotUnits', () => {
  const base: PlotDataset = {
    xLabel: 'time',
    series: [{ key: 's1:position[a]', label: 'x', color: '#1', lineStyle: 'solid', lineSize: 1, enabled: true }],
    data: [[0], [1]],
    pointCount: 1,
    sampleRatio: 1,
    warnings: [],
  };
  it('fills unit and yUnit from topic schema', () => {
    const out = annotatePlotUnits(base, [{ id: 's1', topic: '/js', path: 'position[:]' }], new Map([['/js', { type: 'sensor_msgs/msg/JointState' }]]));
    expect(out.yUnit).toBe('rad');
    expect(out.series[0].unit).toBe('rad');
  });
  it('returns the same dataset when nothing is known', () => {
    expect(annotatePlotUnits(base, [{ id: 's1', topic: '/x', path: 'data' }], new Map())).toBe(base);
  });
});
