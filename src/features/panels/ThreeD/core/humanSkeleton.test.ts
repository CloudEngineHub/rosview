import { describe, expect, it } from 'vitest';
import { findXrobotHumanFrame, xrobotHumanFrameToSkeleton } from './humanSkeleton';

const QUAT = [0, 0, 0, 1];

function frame(names: string[]): Record<string, unknown> {
  return Object.fromEntries(names.map((name, i) => [name, [[i * 0.1, 1.8, 1 - i * 0.01], QUAT]]));
}

const ALL_JOINTS = [
  'Pelvis', 'Spine1', 'Spine2', 'Spine3', 'Neck', 'Head',
  'Left_Collar', 'Left_Shoulder', 'Left_Elbow', 'Left_Wrist', 'Left_Hand',
  'Right_Collar', 'Right_Shoulder', 'Right_Elbow', 'Right_Wrist', 'Right_Hand',
  'Left_Hip', 'Left_Knee', 'Left_Ankle', 'Left_Foot',
  'Right_Hip', 'Right_Knee', 'Right_Ankle', 'Right_Foot',
];

describe('xrobotHumanFrameToSkeleton', () => {
  it('converts a msgpack-wrapped xrobot frame into a parented joint list', () => {
    const message = {
      layout: { dim: [], data_offset: 0 },
      data: new Uint8Array(),
      msgpack: { body_seq: 1, human_format: 'xrobot', human_frame: frame(ALL_JOINTS) },
    };
    const result = xrobotHumanFrameToSkeleton(message);
    expect(result?.joints).toHaveLength(24);

    const byName = new Map(result!.joints.map((joint) => [joint.name, joint]));
    const parentName = (name: string) => {
      const idx = byName.get(name)!.parent_index;
      return idx < 0 ? null : result!.joints[idx].name;
    };
    expect(parentName('Pelvis')).toBeNull();
    expect(parentName('Head')).toBe('Neck');
    expect(parentName('Left_Collar')).toBe('Spine3');
    expect(parentName('Right_Hand')).toBe('Right_Wrist');
    expect(parentName('Left_Hip')).toBe('Pelvis');
    expect(byName.get('Spine1')).toMatchObject({ x: 0.1, y: 1.8, z: 0.99 });
  });

  it('re-parents to the nearest present ancestor when joints are missing', () => {
    const result = xrobotHumanFrameToSkeleton({
      human_frame: frame(['Pelvis', 'Spine3', 'Left_Shoulder']),
    });
    expect(result?.joints.map((j) => [j.name, j.parent_index])).toEqual([
      ['Pelvis', -1],
      ['Spine3', 0],
      ['Left_Shoulder', 1],
    ]);
  });

  it('ignores other human formats and unrelated messages', () => {
    expect(findXrobotHumanFrame({ msgpack: { human_format: 'smpl', human_frame: frame(['Pelvis']) } })).toBeUndefined();
    expect(xrobotHumanFrameToSkeleton({ msgpack: { seq: 1, buttons: 0 } })).toBeUndefined();
    expect(xrobotHumanFrameToSkeleton({ joints: [] })).toBeUndefined();
    expect(xrobotHumanFrameToSkeleton(null)).toBeUndefined();
  });
});
