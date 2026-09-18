import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { ROS2_DEFINITIONS_ARRAY, ROS2_TO_DEFINITIONS } from '@foxglove/rosbag2';
import { MessageWriter } from '@foxglove/rosmsg2-serialization';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { RosDb3IterableSource } from './RosDb3IterableSource';

const TOPIC = '/joint_states';
const TYPE = 'sensor_msgs/msg/JointState';

/** Nanoseconds. Five messages at 1 Hz, so the last one lands exactly on the bag end. */
const T0 = 1_000_000_000_000_000_000n;
const STEP = 1_000_000_000n;
const COUNT = 5;
const T_END = T0 + BigInt(COUNT - 1) * STEP;

const require_ = createRequire(import.meta.url);
const sqlWasm = readFileSync(path.join(path.dirname(require_.resolve('sql.js')), 'sql-wasm.wasm'));
const sqlWasmBinary = sqlWasm.buffer.slice(
  sqlWasm.byteOffset,
  sqlWasm.byteOffset + sqlWasm.byteLength,
);

const toNs = (t: { sec: number; nsec: number }): bigint =>
  BigInt(t.sec) * 1_000_000_000n + BigInt(t.nsec);
const fromNs = (ns: bigint): { sec: number; nsec: number } => ({
  sec: Number(ns / 1_000_000_000n),
  nsec: Number(ns % 1_000_000_000n),
});

/**
 * An in-memory ROS 2 `.db3`, written with the schema `rosbag2` 0.15.x (Humble)
 * emits: `topics(id, name, type, serialization_format, offered_qos_profiles)` and
 * `messages(id, topic_id, timestamp, data)`.
 */
function buildBag(SQL: SqlJsStatic): Uint8Array {
  const writer = new MessageWriter([ROS2_TO_DEFINITIONS.get(TYPE)!, ...ROS2_DEFINITIONS_ARRAY]);
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE schema(schema_version INTEGER PRIMARY KEY, ros_distro TEXT NOT NULL);
    CREATE TABLE topics(
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
      serialization_format TEXT NOT NULL, offered_qos_profiles TEXT NOT NULL);
    CREATE TABLE messages(
      id INTEGER PRIMARY KEY, topic_id INTEGER NOT NULL,
      timestamp INTEGER NOT NULL, data BLOB NOT NULL);
    CREATE INDEX timestamp_idx ON messages (timestamp ASC);
    INSERT INTO schema VALUES (3, 'humble');
  `);
  db.run('INSERT INTO topics VALUES (1, ?, ?, ?, ?)', [TOPIC, TYPE, 'cdr', '']);

  for (let i = 0; i < COUNT; i++) {
    const ns = T0 + BigInt(i) * STEP;
    const data = writer.writeMessage({
      header: { stamp: fromNs(ns), frame_id: '' },
      name: ['joint_a'],
      position: [i],
      velocity: [],
      effort: [],
    });
    // The timestamp is interpolated rather than bound: nanosecond values exceed
    // Number.MAX_SAFE_INTEGER and sql.js binds parameters as doubles.
    db.run(`INSERT INTO messages (topic_id, timestamp, data) VALUES (1, ${ns.toString()}, ?)`, [
      data,
    ]);
  }

  const bytes = db.export();
  db.close();
  return bytes;
}

describe('RosDb3IterableSource', () => {
  let bag: Uint8Array;

  beforeAll(async () => {
    bag = buildBag(await initSqlJs({ wasmBinary: sqlWasmBinary }));
  });

  const makeSource = () =>
    new RosDb3IterableSource({ type: 'data', datas: [bag] }, { sqlWasmBinary });

  it('reports the full message count and time range', async () => {
    const init = await makeSource().initialize();
    expect(init.topics).toHaveLength(1);
    expect(init.topics[0]?.messageCount).toBe(COUNT);
    expect(toNs(init.start)).toBe(T0);
    expect(toNs(init.end)).toBe(T_END);
  });

  it('delivers every message when iterating the full time range', async () => {
    const src = makeSource();
    const init = await src.initialize();
    const stamps: bigint[] = [];
    for await (const msg of src.messageIterator({
      topics: [TOPIC],
      startTime: init.start,
      endTime: init.end,
    })) {
      stamps.push(toNs(msg.receiveTime));
    }
    // endTime is inclusive: the message sitting exactly on init.end must be delivered.
    expect(stamps).toHaveLength(COUNT);
    expect(stamps.at(-1)).toBe(T_END);
  });

  it('delivers every message when no endTime is supplied', async () => {
    const src = makeSource();
    const init = await src.initialize();
    const stamps: bigint[] = [];
    for await (const msg of src.messageIterator({ topics: [TOPIC], startTime: init.start })) {
      stamps.push(toNs(msg.receiveTime));
    }
    expect(stamps).toHaveLength(COUNT);
    expect(stamps.at(-1)).toBe(T_END);
  });

  it('includes both endpoints of a sub-range', async () => {
    const src = makeSource();
    await src.initialize();
    const start = T0 + STEP;
    const end = T0 + 3n * STEP;
    const stamps: bigint[] = [];
    for await (const msg of src.messageIterator({
      topics: [TOPIC],
      startTime: fromNs(start),
      endTime: fromNs(end),
    })) {
      stamps.push(toNs(msg.receiveTime));
    }
    expect(stamps).toEqual([start, start + STEP, end]);
  });

  it('backfills the message at the requested time, not the one before it', async () => {
    const src = makeSource();
    await src.initialize();
    const time = T0 + 2n * STEP;
    const messages = await src.getBackfillMessages({ time: fromNs(time), topics: [TOPIC] });
    expect(messages).toHaveLength(1);
    expect(toNs(messages[0].receiveTime)).toBe(time);
  });

  it('steps forward to the final message', async () => {
    const src = makeSource();
    await src.initialize();
    const msg = await src.getAdjacentMessage({
      time: fromNs(T_END - STEP),
      topics: [TOPIC],
      direction: 'next',
    });
    expect(msg).not.toBeNull();
    expect(toNs(msg!.receiveTime)).toBe(T_END);
  });
});
