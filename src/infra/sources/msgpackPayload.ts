import { decode } from "@msgpack/msgpack";
import { normalizeRosSchemaName } from "@/shared/ros/rosMessageTypes";

/**
 * Byte-array ROS messages are a common carrier for msgpack-encoded structs
 * (e.g. teleop recordings). When the payload decodes cleanly as a msgpack map
 * we expose it as a sibling `msgpack` field so Plot / Raw Messages / 3D can
 * address its fields; the original `layout` / `data` are left untouched.
 */
const BYTE_ARRAY_SCHEMAS = new Set(["std_msgs/bytemultiarray", "std_msgs/uint8multiarray"]);

function isMsgpackMapMarker(byte: number): boolean {
  // fixmap (0x80–0x8f), map16 (0xde), map32 (0xdf)
  return (byte >= 0x80 && byte <= 0x8f) || byte === 0xde || byte === 0xdf;
}

/** Decode `bytes` as a single top-level msgpack map; undefined for anything else. */
export function tryDecodeMsgpackMap(bytes: Uint8Array): Record<string, unknown> | undefined {
  if (bytes.length === 0 || !isMsgpackMapMarker(bytes[0])) return undefined;
  try {
    // `decode` throws on trailing bytes, which rejects payloads that only start like a map.
    const value = decode(bytes);
    if (value == null || typeof value !== "object" || Array.isArray(value) || value instanceof Uint8Array) {
      return undefined;
    }
    return value as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export function isByteArraySchema(schemaName: string | undefined): boolean {
  return schemaName != null && BYTE_ARRAY_SCHEMAS.has(normalizeRosSchemaName(schemaName));
}

/** Attach `msgpack` to an already-deserialized byte-array message when its `data` is a msgpack map. */
export function attachMsgpackPayload(message: unknown): unknown {
  if (message == null || typeof message !== "object") return message;
  const data = (message as { data?: unknown }).data;
  const bytes =
    data instanceof Uint8Array
      ? data
      : data instanceof Int8Array
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : Array.isArray(data) && data.length > 0 && typeof data[0] === "number"
          ? Uint8Array.from(data as number[])
          : undefined;
  if (!bytes) return message;
  const decoded = tryDecodeMsgpackMap(bytes);
  return decoded ? { ...message, msgpack: decoded } : message;
}

/** Wrap a channel deserializer so byte-array schemas gain the decoded `msgpack` field. */
export function withMsgpackPayload(
  schemaName: string | undefined,
  deserialize: (data: ArrayBufferView) => unknown,
): (data: ArrayBufferView) => unknown {
  if (!isByteArraySchema(schemaName)) return deserialize;
  return (data) => attachMsgpackPayload(deserialize(data));
}
