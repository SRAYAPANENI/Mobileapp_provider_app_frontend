import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A form's own copy of server data (docs/APP_DATA_ARCHITECTURE.md §2).
 * It follows the server's value until the person edits it; from then on a
 * refresh never overwrites what they typed, until `saved()` says it's on file.
 * `signature` turns the server value into a string, to notice real changes.
 * `kept`: an unsaved draft from before the form was last shown, to carry on with.
 */
export function useDraft<T>(server: T, signature: (value: T) => string, kept?: T) {
  const [draft, setDraft] = useState<T>(kept ?? server);
  const editing = useRef(kept != null);
  const serverSig = signature(server);
  useEffect(() => {
    if (!editing.current) setDraft(server);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSig]);
  const edit = useCallback((next: T | ((prev: T) => T)) => {
    editing.current = true;
    setDraft(next);
  }, []);
  // Saved: follow the server again (its fresh copy is what was just saved).
  const saved = useCallback(() => { editing.current = false; }, []);
  return { draft, edit, saved };
}
