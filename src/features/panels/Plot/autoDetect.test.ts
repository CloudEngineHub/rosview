import { describe, expect, it } from 'vitest';
import { detectPlotPaths, normalizeSchemaName } from './autoDetect';

describe('normalizeSchemaName', () => {
  it('normalizes ROS2 schema names', () => {
    expect(normalizeSchemaName('sensor_msgs/msg/JointState')).toBe('sensor_msgs/jointstate');
  });
});

describe('detectPlotPaths', () => {
  it('detects JointState paths from ROS2 schema', () => {
    expect(detectPlotPaths({ schemaName: 'sensor_msgs/msg/JointState' })).toEqual([
      { path: 'position[:]', label: 'position' },
    ]);
  });

  it('detects JointState paths from ROS1 schema', () => {
    expect(detectPlotPaths({ schemaName: 'sensor_msgs/JointState' })).toEqual([
      { path: 'position[:]', label: 'position' },
    ]);
  });

  it('detects Imu component paths', () => {
    const paths = detectPlotPaths({ schemaName: 'sensor_msgs/msg/Imu' });
    expect(paths.map((entry) => entry.path)).toEqual([
      'linear_acceleration.x',
      'linear_acceleration.y',
      'linear_acceleration.z',
      'angular_velocity.x',
      'angular_velocity.y',
      'angular_velocity.z',
    ]);
  });

  it('detects TwistStamped before generic Twist', () => {
    const paths = detectPlotPaths({ schemaName: 'geometry_msgs/msg/TwistStamped' });
    expect(paths[0]?.path).toBe('twist.linear.x');
  });

  it('detects PoseStamped position paths', () => {
    const paths = detectPlotPaths({ schemaName: 'geometry_msgs/msg/PoseStamped' });
    expect(paths.map((entry) => entry.path)).toEqual([
      'pose.position.x',
      'pose.position.y',
      'pose.position.z',
    ]);
  });

  it('falls back to sample discovery for unknown schemas', () => {
    const paths = detectPlotPaths({
      schemaName: 'custom_msgs/msg/Foo',
      sample: { foo: { bar: { x: 1, y: 2 } } },
    });
    expect(paths.map((entry) => entry.path)).toEqual(['foo.bar.x', 'foo.bar.y']);
  });

  it('detects TFMessage translation paths and exposes rotation for manual selection', () => {
    const paths = detectPlotPaths({
      schemaName: 'tf2_msgs/msg/TFMessage',
      sample: {
        transforms: [{
          child_frame_id: 'link_Hips_R',
          transform: {
            translation: { x: 0, y: 0, z: 0.9712 },
            rotation: { x: 0.03, y: 0, z: 0, w: 0.99 },
          },
        }],
      },
    });
    expect(paths.map((entry) => entry.path)).toEqual([
      'transforms[:].transform.translation.x',
      'transforms[:].transform.translation.y',
      'transforms[:].transform.translation.z',
      'transforms[:].transform.rotation.x',
      'transforms[:].transform.rotation.y',
      'transforms[:].transform.rotation.z',
      'transforms[:].transform.rotation.w',
    ]);
    expect(paths.filter((entry) => entry.default === false).map((entry) => entry.path)).toEqual([
      'transforms[:].transform.rotation.x',
      'transforms[:].transform.rotation.y',
      'transforms[:].transform.rotation.z',
      'transforms[:].transform.rotation.w',
    ]);
  });

  it('detects Float64MultiArray', () => {
    expect(detectPlotPaths({ schemaName: 'std_msgs/msg/Float64MultiArray' })).toEqual([
      { path: 'data[:]', label: 'data' },
    ]);
  });

  it('returns empty for unknown schemas', () => {
    expect(detectPlotPaths({ schemaName: 'custom/Unknown' })).toEqual([]);
  });

  it('returns empty for Image schemas', () => {
    expect(detectPlotPaths({ schemaName: 'sensor_msgs/msg/Image' })).toEqual([]);
  });

  it('prefers decoded msgpack fields over raw ByteMultiArray bytes', () => {
    const sample = {
      layout: { dim: [], data_offset: 0 },
      data: new Uint8Array([0x80]),
      msgpack: {
        sample_idx: 71083,
        body_seq: 70022,
        retarget_done_ns: 2021733142440,
        robot_name: 't2',
        joint_pos: [0, 0.1, -0.03],
        joint_vel: [0, -0.5, 0.1],
        root_pos: [0.23, 1.52, 0.99],
      },
    };
    const paths = detectPlotPaths({ schemaName: 'std_msgs/msg/ByteMultiArray', sample });
    expect(paths.some((entry) => entry.path === 'data[:]')).toBe(false);
    expect(paths.find((entry) => entry.path === 'msgpack.joint_pos[:]')?.default).toBe(true);
    expect(paths.find((entry) => entry.path === 'msgpack.retarget_done_ns')?.default).toBe(false);
    expect(paths.find((entry) => entry.path === 'msgpack.body_seq')?.default).toBe(false);
  });

  it('keeps raw data path for ByteMultiArray without msgpack payload', () => {
    const sample = { layout: { dim: [], data_offset: 0 }, data: new Uint8Array([1, 2]) };
    expect(detectPlotPaths({ schemaName: 'std_msgs/msg/ByteMultiArray', sample })).toEqual([
      { path: 'data[:]', label: 'data' },
    ]);
  });

  it('suggests per-clock latency curves for msgpack stamps', () => {
    const retargeting = {
      data: new Uint8Array(),
      msgpack: {
        sample_ns: 2_046_686_595_060,
        body_recv_ns: 2_046_686_847_106,
        retarget_done_ns: 2_046_708_995_666,
        joint_pos: [0, 0.1],
      },
    };
    const paths = detectPlotPaths({ schemaName: 'std_msgs/msg/ByteMultiArray', sample: retargeting });
    const latency = paths.filter((entry) => entry.path.endsWith('@ns2ms'));
    expect(latency.map((entry) => entry.path)).toEqual([
      'msgpack.body_recv_ns@sub(msgpack.sample_ns)@ns2ms',
      'msgpack.retarget_done_ns@sub(msgpack.body_recv_ns)@ns2ms',
      'msgpack.retarget_done_ns@sub(msgpack.sample_ns)@ns2ms',
    ]);
    expect(latency.every((entry) => entry.default === false)).toBe(true);

    // Monotonic and epoch stamps never pair up; the epoch one is compared with receive time.
    const control = {
      data: new Uint8Array(),
      msgpack: { seq: 1, recv_ns: 2_046_706_268_356, source_ns: 1_793_123_416_161_868_032 },
    };
    const controlLatency = detectPlotPaths({ schemaName: 'std_msgs/msg/ByteMultiArray', sample: control })
      .filter((entry) => entry.path.endsWith('@ns2ms'))
      .map((entry) => entry.path);
    expect(controlLatency).toEqual(['$receive_ns@sub(msgpack.source_ns)@ns2ms']);

    // A payload with only bookkeeping stamps defaults to its latency curve.
    const body = {
      data: new Uint8Array(),
      msgpack: { body_seq: 1, body_recv_ns: 2_046_706_268_356, convert_done_ns: 2_046_706_334_144 },
    };
    const bodyPaths = detectPlotPaths({ schemaName: 'std_msgs/msg/ByteMultiArray', sample: body });
    expect(bodyPaths.filter((entry) => entry.default !== false).map((entry) => entry.path)).toEqual([
      'msgpack.convert_done_ns@sub(msgpack.body_recv_ns)@ns2ms',
    ]);
  });

  it('detects Booster LowState / LowCmd motor paths', () => {
    const motor = { mode: 0, q: 0.1, dq: 0, ddq: 0, tau_est: 0.2, temperature: 36, lost: 0, reserve: new Uint32Array(2) };
    const lowState = {
      imu_state: { rpy: new Float32Array(3), gyro: new Float32Array(3), acc: new Float32Array(3) },
      motor_state_parallel: [motor, motor],
      motor_state_serial: [motor, motor],
    };
    const statePaths = detectPlotPaths({ schemaName: 'booster_interface/msg/LowState', sample: lowState });
    expect(statePaths.filter((entry) => entry.default !== false).map((entry) => entry.path)).toEqual([
      'motor_state_serial[:].q',
    ]);
    expect(statePaths.map((entry) => entry.path)).toEqual(
      expect.arrayContaining(['motor_state_parallel[:].tau_est', 'motor_state_serial[:].temperature', 'imu_state.rpy[:]']),
    );

    const cmd = { mode: 0, q: 0.1, dq: 0, tau: 0, kp: 28, kd: 0.9, weight: 0 };
    const cmdPaths = detectPlotPaths({ schemaName: 'booster_interface/msg/LowCmd', sample: { cmd_type: 1, motor_cmd: [cmd] } });
    expect(cmdPaths.map((entry) => entry.path)).toEqual([
      'motor_cmd[:].q', 'motor_cmd[:].dq', 'motor_cmd[:].tau', 'motor_cmd[:].kp', 'motor_cmd[:].kd',
    ]);

    // Before any message arrives, fall back to the known Booster layout.
    expect(detectPlotPaths({ schemaName: 'booster_interface/msg/LowState' })[0]?.path).toBe('motor_state_serial[:].q');
  });
});
