/**
 * Soft copy/paste deterrent for premium content shown to Free / Trial users.
 *
 * NOT a security boundary — anyone with devtools can bypass this in seconds.
 * The point is two-fold:
 *   1. Add friction to bulk copy-into-Word workflows.
 *   2. When someone *does* paste our content elsewhere, the clipboard is
 *      replaced with an attribution string, which acts as a soft watermark
 *      and an upgrade nudge.
 *
 * Returns props you spread onto the wrapper element. When `enabled` is false
 * the props are inert so paid users get a normal experience.
 */
import { useCallback, useMemo } from 'react';

export type CopyProtectionProps = {
  className: string;
  onCopy: (e: React.ClipboardEvent<HTMLElement>) => void;
  onCut: (e: React.ClipboardEvent<HTMLElement>) => void;
  /** Stops right-click → Save Image / Copy in most browsers. */
  onContextMenu: (e: React.MouseEvent<HTMLElement>) => void;
};

export function useCopyProtection(enabled: boolean, attribution: string): CopyProtectionProps {
  const handleCopy = useCallback(
    (e: React.ClipboardEvent<HTMLElement>) => {
      if (!enabled) return;
      e.preventDefault();
      const sel = window.getSelection()?.toString() ?? '';
      // Keep a tiny snippet so the user knows they "copied" something, then
      // append the attribution + upgrade nudge.
      const snippet = sel.length > 120 ? sel.slice(0, 120) + '…' : sel;
      const payload = `${snippet}\n\n— ${attribution}`;
      e.clipboardData.setData('text/plain', payload);
      e.clipboardData.setData('text/html', payload.replace(/\n/g, '<br/>'));
    },
    [enabled, attribution],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (!enabled) return;
      e.preventDefault();
    },
    [enabled],
  );

  return useMemo(
    () => ({
      className: enabled ? 'select-none' : '',
      onCopy: handleCopy,
      onCut: handleCopy,
      onContextMenu: handleContextMenu,
    }),
    [enabled, handleCopy, handleContextMenu],
  );
}
