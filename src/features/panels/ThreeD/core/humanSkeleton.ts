/**
 * Human body frames from teleop mocap (`human_format: "xrobot"`): a map of joint
 * name → `[[x, y, z], [qx, qy, qz, qw]]` in meters, Z-up world frame. Usually
 * carried as msgpack inside `std_msgs/ByteMultiArray`, so the frame may sit under
 * the decoded `msgpack` field. Converted to the BVH skeleton frame shape consumed
 * by `extractBvhSkeletonPrimitives`.
 */

/** Child → parent topology of the 24-joint xrobot body. */
const XROBOT_PARENTS: ReadonlyArray<readonly [string, string | null]> = [
  ['Pelvis', null],
  ['Spine1', 'Pelvis'],
  ['Spine2', 'Spine1'],
  ['Spine3', 'Spine2'],
  ['Neck', 'Spine3'],
  ['Head', 'Neck'],
  ['Left_Collar', 'Spine3'],
  ['Left_Shoulder', 'Left_Collar'],
  ['Left_Elbow', 'Left_Shoulder'],
  ['Left_Wrist', 'Left_Elbow'],
  ['Left_Hand', 'Left_Wrist'],
  ['Right_Collar', 'Spine3'],
  ['Right_Shoulder', 'Right_Collar'],
  ['Right_Elbow', 'Right_Shoulder'],
  ['Right_Wrist', 'Right_Elbow'],
  ['Right_Hand', 'Right_Wrist'],
  ['Left_Hip', 'Pelvis'],
  ['Left_Knee', 'Left_Hip'],
  ['Left_Ankle', 'Left_Knee'],
  ['Left_Foot', 'Left_Ankle'],
  ['Right_Hip', 'Pelvis'],
  ['Right_Knee', 'Right_Hip'],
  ['Right_Ankle', 'Right_Knee'],
  ['Right_Foot', 'Right_Ankle'],
];

export interface SkeletonFrameJoint {
  name: string;
  x: number;
  y: number;
  z: number;
  parent_index: number;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Locate the xrobot `human_frame` map on a message, directly or under its decoded `msgpack` payload. */
export function findXrobotHumanFrame(message: unknown): Record<string, unknown> | undefined {
  const rec = asRecord(message);
  if (!rec) return undefined;
  const holder = asRecord(rec.human_frame) ? rec : asRecord(rec.msgpack);
  if (!holder) return undefined;
  const format = holder.human_format;
  if (format != null && format !== 'xrobot') return undefined;
  return asRecord(holder.human_frame);
}

function readPosition(entry: unknown): [number, number, number] | undefined {
  if (!Array.isArray(entry)) return undefined;
  const pos: unknown = entry[0];
  if (!Array.isArray(pos) || pos.length < 3) return undefined;
  const xyz = [Number(pos[0]), Number(pos[1]), Number(pos[2])] as [number, number, number];
  return xyz.every(Number.isFinite) ? xyz : undefined;
}

/**
 * Convert an xrobot human frame into `{ joints }` for the skeleton renderer.
 * Joints missing from the frame are dropped and their children re-parented to the
 * nearest present ancestor. Returns undefined when the message has no usable frame.
 */
export function xrobotHumanFrameToSkeleton(message: unknown): { joints: SkeletonFrameJoint[] } | undefined {
  const frame = findXrobotHumanFrame(message);
  if (!frame) return undefined;

  const parentOf = new Map(XROBOT_PARENTS);
  const indexByName = new Map<string, number>();
  const joints: SkeletonFrameJoint[] = [];
  for (const [name] of XROBOT_PARENTS) {
    const position = readPosition(frame[name]);
    if (!position) continue;
    let parent = parentOf.get(name) ?? null;
    while (parent != null && !indexByName.has(parent)) parent = parentOf.get(parent) ?? null;
    indexByName.set(name, joints.length);
    joints.push({
      name,
      x: position[0],
      y: position[1],
      z: position[2],
      parent_index: parent != null ? indexByName.get(parent)! : -1,
    });
  }
  return joints.length > 0 ? { joints } : undefined;
}
