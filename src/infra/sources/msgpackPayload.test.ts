import { encode } from "@msgpack/msgpack";
import { describe, expect, it } from "vitest";
import { attachMsgpackPayload, tryDecodeMsgpackMap, withMsgpackPayload } from "./msgpackPayload";

describe("tryDecodeMsgpackMap", () => {
  it("decodes a top-level map", () => {
    const bytes = encode({ seq: 7, joint_pos: [0.5, -1.25], robot_name: "t2" });
    expect(tryDecodeMsgpackMap(bytes)).toEqual({ seq: 7, joint_pos: [0.5, -1.25], robot_name: "t2" });
  });

  it("rejects non-map payloads", () => {
    expect(tryDecodeMsgpackMap(encode([1, 2, 3]))).toBeUndefined();
    expect(tryDecodeMsgpackMap(encode(42))).toBeUndefined();
    expect(tryDecodeMsgpackMap(new Uint8Array([1, 2, 3, 4]))).toBeUndefined();
    expect(tryDecodeMsgpackMap(new Uint8Array())).toBeUndefined();
  });

  it("rejects payloads with trailing bytes", () => {
    const map = encode({ a: 1 });
    const padded = new Uint8Array(map.length + 2);
    padded.set(map);
    expect(tryDecodeMsgpackMap(padded)).toBeUndefined();
  });
});

describe("attachMsgpackPayload", () => {
  it("adds a msgpack field while keeping the raw bytes", () => {
    const data = encode({ left_trigger: 0.25 });
    const message = { layout: { dim: [], data_offset: 0 }, data };
    expect(attachMsgpackPayload(message)).toEqual({ ...message, msgpack: { left_trigger: 0.25 } });
  });

  it("returns the message unchanged when data is not msgpack", () => {
    const message = { layout: { dim: [], data_offset: 0 }, data: new Uint8Array([1, 2, 3]) };
    expect(attachMsgpackPayload(message)).toBe(message);
  });
});

describe("withMsgpackPayload", () => {
  const raw = { data: encode({ a: 1 }) };

  it("wraps byte-array schemas", () => {
    const deserialize = withMsgpackPayload("std_msgs/msg/ByteMultiArray", () => raw);
    expect(deserialize(new Uint8Array())).toEqual({ ...raw, msgpack: { a: 1 } });
  });

  it("leaves other schemas untouched", () => {
    const inner = () => raw;
    expect(withMsgpackPayload("std_msgs/msg/Float64MultiArray", inner)).toBe(inner);
  });
});
