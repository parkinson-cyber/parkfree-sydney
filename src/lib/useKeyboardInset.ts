/**
 * How much of the screen the keyboard is covering, right now.
 *
 * This exists because of one specific iOS Safari behaviour: focus an input
 * near the bottom of the page and Safari shoves the whole viewport upward to
 * reveal it — which drags the map with it. For a map app that is disorienting;
 * you look away for a second and the world has moved.
 *
 * So instead of letting the browser move everything, we measure the keyboard
 * and lift only the bottom chrome by that much. The map never moves.
 *
 * On native, RN reports keyboard height directly. On web we use visualViewport,
 * which is the only reliable signal for the on-screen keyboard, and we also
 * undo Safari's scroll so the page can't creep upward.
 */

import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      const show = Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
        (e) => setInset(e.endCoordinates?.height ?? 0),
      );
      const hide = Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
        () => setInset(0),
      );
      return () => { show.remove(); hide.remove(); };
    }

    const vv = typeof window !== 'undefined' ? window.visualViewport : undefined;
    if (!vv) return;

    const update = () => {
      // The gap between the layout viewport and what's actually visible is
      // the keyboard (plus any browser chrome the keyboard pushed away).
      const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setInset(covered > 80 ? covered : 0);
      // Safari may have scrolled the document to reveal the input. Undo it —
      // the chrome lifts itself, so nothing needs scrolling.
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}
