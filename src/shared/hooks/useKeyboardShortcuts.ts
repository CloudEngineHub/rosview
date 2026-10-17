import { useEffect, useRef } from 'react';
import type { Player } from '@/core/types/player';
import { MAX_PLAYBACK_SPEED } from '@/core/types/player';
import { useMessagePipeline } from '@/core/pipeline/useMessagePipeline';
import type { MessagePipelineState } from '@/core/pipeline/store';
import { resolveStepMsFromModifiers } from '@/shared/utils/playbackStep';
import { useShallow } from 'zustand/react/shallow';

/** Roles whose own keyboard model uses arrow keys (and Space). */
const COMPOSITE_ROLES = new Set([
  'tab',
  'tablist',
  'slider',
  'radio',
  'radiogroup',
  'checkbox',
  'switch',
  'listbox',
  'option',
  'menu',
  'menubar',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tree',
  'treeitem',
  'grid',
  'gridcell',
  'spinbutton',
  'scrollbar',
  'textbox',
  'combobox',
  'searchbox',
]);

/** Elements that Space activates natively. */
const ACTIVATABLE_TAGS = new Set(['BUTTON', 'A', 'SUMMARY']);
const ACTIVATABLE_ROLES = new Set(['button', 'link']);

type ElementLike = {
  nodeType: number;
  tagName: string;
  isContentEditable?: boolean;
  getAttribute(name: string): string | null;
  closest?(selector: string): unknown;
};

/** Realm-safe element check: embedders may render the viewer into another window. */
function asElement(target: EventTarget | null): ElementLike | null {
  const node = target as Partial<ElementLike> | null;
  if (!node || node.nodeType !== 1 || typeof node.tagName !== 'string' || typeof node.getAttribute !== 'function') {
    return null;
  }
  return node as ElementLike;
}

/** True when a key press belongs to a text field, select, or editable region. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = asElement(target);
  if (!el) {
    return false;
  }
  if (el.isContentEditable) {
    return true;
  }
  const tag = el.tagName.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  const role = el.getAttribute('role');
  return role === 'textbox' || role === 'combobox' || role === 'searchbox';
}

/**
 * True when the focused control owns this key, so playback must not take it:
 * text entry and composite widgets (tabs, sliders, radios, menus, lists) own
 * Space and the arrows; buttons and links own Space (activation). Keys inside
 * a dialog always belong to the dialog.
 */
export function isShortcutOwnedByTarget(target: EventTarget | null, code: string): boolean {
  const el = asElement(target);
  if (!el) {
    return false;
  }
  if (isTypingTarget(el as unknown as EventTarget)) {
    return true;
  }
  if (typeof el.closest === 'function' && el.closest('[role="dialog"], [role="alertdialog"]')) {
    return true;
  }
  const role = el.getAttribute('role');
  if (role && COMPOSITE_ROLES.has(role)) {
    return true;
  }
  if (code === 'Space') {
    const tag = el.tagName.toUpperCase();
    return ACTIVATABLE_TAGS.has(tag) || (role !== null && ACTIVATABLE_ROLES.has(role));
  }
  return false;
}

/**
 * True when playback must ignore this keydown: IME composition, a Ctrl/Cmd
 * chord without Alt (browser and host shortcuts such as Cmd+Arrow history
 * navigation; Ctrl/Cmd has only ever meant something together with Alt, as
 * the 100 ms time step), or a key the focused control owns.
 */
export function isShortcutLeftToOthers(
  e: Pick<KeyboardEvent, 'isComposing' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target' | 'code'>,
): boolean {
  if (e.isComposing) return true;
  if ((e.ctrlKey || e.metaKey) && !e.altKey) return true;
  return isShortcutOwnedByTarget(e.target, e.code);
}

export function useKeyboardShortcuts(player: Player) {
  const { isPlaying, speed } = useMessagePipeline(
    useShallow((state: MessagePipelineState) => ({
      isPlaying: state.playerState.activeData?.isPlaying ?? false,
      speed: state.playerState.activeData?.speed ?? 1,
    })),
  );
  const isPlayingRef = useRef(isPlaying);
  const speedRef = useRef(speed);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    speedRef.current = speed;
  }, [isPlaying, speed]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isShortcutLeftToOthers(e)) {
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (isPlayingRef.current) {
            player.pause();
          } else {
            player.play();
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.altKey) {
            player.stepBy(-resolveStepMsFromModifiers(e));
          } else {
            player.stepMessage(-1);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.altKey) {
            player.stepBy(resolveStepMsFromModifiers(e));
          } else {
            player.stepMessage(1);
          }
          break;
        case 'BracketLeft': {
          e.preventDefault();
          const cur = speedRef.current;
          if (cur > 8) {
            player.setSpeed(8);
          } else {
            player.setSpeed(Math.max(0.1, cur / 2));
          }
          break;
        }
        case 'BracketRight': {
          e.preventDefault();
          const cur = speedRef.current;
          if (cur >= 8) {
            player.setSpeed(MAX_PLAYBACK_SPEED);
          } else {
            player.setSpeed(Math.min(8, cur * 2));
          }
          break;
        }
      }
    };

    // Capture phase so playback shortcuts still run if Dockview stops propagation in bubble phase.
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [player]);
}
