/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import { isShortcutLeftToOthers, isShortcutOwnedByTarget, isTypingTarget } from './useKeyboardShortcuts';

function el(tag: string, attrs: Record<string, string> = {}): HTMLElement {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

describe('playback shortcut ownership', () => {
  it('leaves every key to text fields and editable regions', () => {
    for (const node of [el('input'), el('textarea'), el('select'), el('div', { role: 'combobox' })]) {
      expect(isTypingTarget(node)).toBe(true);
      expect(isShortcutOwnedByTarget(node, 'Space')).toBe(true);
      expect(isShortcutOwnedByTarget(node, 'ArrowRight')).toBe(true);
    }
  });

  it('leaves Space and arrows to composite widgets', () => {
    for (const role of ['tab', 'slider', 'radio', 'checkbox', 'menuitem', 'option', 'switch', 'spinbutton']) {
      const node = el('div', { role });
      expect(isShortcutOwnedByTarget(node, 'Space'), role).toBe(true);
      expect(isShortcutOwnedByTarget(node, 'ArrowLeft'), role).toBe(true);
    }
  });

  it('leaves Space to buttons and links but lets arrows step playback', () => {
    for (const node of [el('button'), el('a', { href: '#' }), el('div', { role: 'button' })]) {
      expect(isShortcutOwnedByTarget(node, 'Space')).toBe(true);
      expect(isShortcutOwnedByTarget(node, 'ArrowRight')).toBe(false);
    }
  });

  it('leaves keys inside a dialog to the dialog', () => {
    const dialog = el('div', { role: 'dialog' });
    const inner = el('span');
    dialog.appendChild(inner);
    document.body.appendChild(dialog);
    expect(isShortcutOwnedByTarget(inner, 'ArrowRight')).toBe(true);
    dialog.remove();
  });

  it('handles keys from the page itself and works across realms', () => {
    expect(isShortcutOwnedByTarget(document.body, 'Space')).toBe(false);
    expect(isShortcutOwnedByTarget(null, 'Space')).toBe(false);
    // An element from another window fails `instanceof HTMLElement` but is still recognised.
    const foreign = {
      nodeType: 1,
      tagName: 'INPUT',
      getAttribute: () => null,
    } as unknown as EventTarget;
    expect(isTypingTarget(foreign)).toBe(true);
  });

  it('keeps Alt+Ctrl/Cmd+Arrow time steps but leaves plain Ctrl/Cmd chords and IME input to others', () => {
    const base = { isComposing: false, ctrlKey: false, metaKey: false, altKey: false, target: document.body, code: 'ArrowRight' };
    expect(isShortcutLeftToOthers(base)).toBe(false);
    expect(isShortcutLeftToOthers({ ...base, altKey: true })).toBe(false);
    expect(isShortcutLeftToOthers({ ...base, altKey: true, ctrlKey: true })).toBe(false);
    expect(isShortcutLeftToOthers({ ...base, altKey: true, metaKey: true })).toBe(false);
    expect(isShortcutLeftToOthers({ ...base, ctrlKey: true })).toBe(true);
    expect(isShortcutLeftToOthers({ ...base, metaKey: true })).toBe(true);
    expect(isShortcutLeftToOthers({ ...base, code: 'Space', isComposing: true })).toBe(true);
  });
});
