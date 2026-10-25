/**
 * dsh-delivery-native-open — browser half.
 *
 * Two surfaces of `ui-deliverables` activate a file with a plain click, and
 * neither is an extension point:
 *
 * - the `present` delivery card, whose activation button previews in the Sidebar;
 * - the changed-files card, whose rows and single-file header open the turn's
 *   review tab.
 *
 * The plugin therefore attaches at the DOM and re-drives the authorized Host
 * path open instead:
 *
 * 1. `deliverables.file.actions` (a list slot this plugin may occupy) mounts an
 *    invisible probe inside every delivery card; the probe intercepts that
 *    card's activation and calls the slot owner's `onAction('open')`.
 * 2. A document-level capture listener handles the changed-files card, taking
 *    the absolute path from the hidden description element the card already
 *    renders and calling `session.openWorkspacePath` through the client Remote.
 *
 * Modifier clicks always fall through to the original gesture, and every
 * failure replays it, so the stock Sidebar preview and review tab stay
 * reachable.
 */
window.__ModuleLoader__.load({
  id: 'dsh-delivery-native-open',
  factory: (require) => {
    var module = { exports: {} }; var exports = module.exports;
    'use strict';

    const React = require('react');

    /** Attribute the delivery card wrapper carries; the probe resolves its own card through it. */
    const CARD_ATTRIBUTE = '[data-presented-file]';
    /** The delivery card's own activation button is its first direct child button. */
    const ACTIVATION_SELECTOR = ':scope > button';
    /** The changed-files card, including its single-file form. */
    const CHANGED_CARD_ATTRIBUTE = '[data-changed-files]';
    /** Lets a replayed activation run without being intercepted again. */
    let replaying = false;

    const STYLE = `
[data-delivery-native-open-preview] {
  display: inline-grid; flex: none; place-items: center; width: 24px; height: 24px;
  padding: 0; border: 0; border-radius: 6px; background: transparent;
  color: var(--dsw-alias-label-tertiary, #6b7280); cursor: pointer;
}
[data-delivery-native-open-preview]:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.14));
  color: var(--dsw-alias-label-primary, currentColor);
}
[data-delivery-native-open-preview]:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #4d6bfe));
}
[data-delivery-native-open-preview] svg { width: 16px; height: 16px; }
`;

    /** Sidebar glyph: a rounded frame with one divider. */
    function PanelGlyph() {
      return React.createElement('svg', {
        viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false',
      },
      React.createElement('rect', {
        x: '2.25', y: '2.75', width: '11.5', height: '10.5', rx: '2',
        stroke: 'currentColor', strokeWidth: '1.2',
      }),
      React.createElement('path', { d: 'M6.5 2.75V13.25', stroke: 'currentColor', strokeWidth: '1.2' }));
    }

    /** Replay one element's activation without the capture listeners claiming it. */
    function replay(activation) {
      if (activation === null || activation === undefined) return;
      replaying = true;
      try { activation.click(); } finally { replaying = false; }
    }

    /** A modifier click keeps the original gesture. */
    function modified(event) {
      return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
    }

    /**
     * Open one Host path, retrying the Windows separator spelling because the
     * rendered path may use forward slashes while the Host filesystem reports
     * backslashes.
     * @param {object} remote - client Remote whose session namespace opens paths.
     * @param {string} path - absolute path as the card rendered it.
     * @returns {Promise<boolean>} whether the Host accepted a spelling.
     */
    async function openHostPath(remote, path) {
      const candidates = [path];
      const backslashed = path.replaceAll('/', '\\');
      if (backslashed !== path) candidates.push(backslashed);
      for (const candidate of candidates) {
        try {
          const result = await remote.session.openWorkspacePath({ path: candidate });
          if (result !== null && typeof result === 'object' && result.ok === true) return true;
        } catch (_error) {
          // An unreachable carrier is a failed gesture, not a crash: try the next spelling.
        }
      }
      return false;
    }

    /**
     * Invisible probe plus the visible preview button for one delivery card.
     * @param {object} props - `deliverables.file.actions` owner values.
     * @returns {object} the probe and, when a desktop exists, the preview control.
     */
    function NativeOpenProbe(props) {
      const { actionUrl, available, pending, onAction } = props;
      const probe = React.useRef(null);
      const latest = React.useRef({ onAction, pending });
      latest.current = { onAction, pending };

      React.useEffect(() => {
        const node = probe.current;
        const card = node !== null && typeof node.closest === 'function' ? node.closest(CARD_ATTRIBUTE) : null;
        if (card === null || !available) return undefined;
        const activation = card.querySelector(ACTIVATION_SELECTOR);
        if (activation === null) return undefined;
        const onClick = (event) => {
          if (replaying) return;
          if (modified(event)) return;
          if (latest.current.pending) return;
          event.preventDefault();
          event.stopPropagation();
          const run = latest.current.onAction;
          if (typeof run === 'function') Promise.resolve(run('open')).catch(() => {});
        };
        activation.addEventListener('click', onClick, true);
        return () => activation.removeEventListener('click', onClick, true);
      }, [available]);

      const hidden = React.createElement('span', {
        ref: probe, hidden: true, 'data-delivery-native-open': actionUrl,
      });
      if (!available) return hidden;
      return React.createElement(React.Fragment, null, hidden, React.createElement('button', {
        type: 'button',
        'data-delivery-native-open-preview': actionUrl,
        title: '在侧边栏预览',
        'aria-label': '在侧边栏预览',
        onClick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          const card = probe.current !== null && typeof probe.current.closest === 'function'
            ? probe.current.closest(CARD_ATTRIBUTE) : null;
          if (card === null) return;
          replay(card.querySelector(ACTIVATION_SELECTOR));
        },
      }, React.createElement(PanelGlyph)));
    }

    /**
     * Intercept the changed-files card: its header and rows describe the file
     * through a hidden element, which yields the absolute path the Host opens.
     * @param {object} ctx - client plugin context providing `remote`.
     * @returns {() => void} the listener cleanup.
     */
    function watchChangedFiles(ctx) {
      let desktop = null;
      try {
        const read = ctx.remote.session.canOpenWorkspacePath();
        if (read !== null && typeof read.then === 'function') {
          read.then((result) => {
            desktop = result !== null && typeof result === 'object' && result.ok === true && result.value === true;
          }).catch(() => { desktop = false; });
        }
      } catch (_error) {
        // Without an answer the click still tries the Host and replays on failure.
      }
      const onClick = (event) => {
        if (replaying) return;
        if (modified(event)) return;
        if (desktop === false) return;
        const target = event.target;
        const button = target !== null && typeof target.closest === 'function' ? target.closest('button') : null;
        if (button === null || button.closest(CHANGED_CARD_ATTRIBUTE) === null) return;
        const describedBy = button.getAttribute('aria-describedby');
        if (describedBy === null || describedBy === '') return;
        const holder = document.getElementById(describedBy);
        const path = holder === null ? null : holder.textContent;
        if (path === null || path.trim() === '') return;
        event.preventDefault();
        event.stopPropagation();
        openHostPath(ctx.remote, path.trim()).then((opened) => {
          if (!opened) replay(button);
        });
      };
      document.addEventListener('click', onClick, true);
      return () => document.removeEventListener('click', onClick, true);
    }

    /**
     * Register the stylesheet, the delivery-card probe, and the changed-files listener.
     * @param {object} ctx - client plugin context providing `slots` and `remote`.
     */
    function apply(ctx) {
      ctx.effect(() => {
        const style = document.createElement('style');
        style.setAttribute('data-delivery-native-open', '');
        style.textContent = STYLE;
        document.head.append(style);
        return () => { style.remove(); };
      }, 'delivery-native-open: styles');
      ctx.effect(() => ctx.slots.inject('deliverables.file.actions', () => ctx.slots.register(
        { name: 'deliverables.file.actions', id: 'dsh-delivery-native-open' },
        NativeOpenProbe,
      )), 'delivery-native-open: probe');
      ctx.effect(() => watchChangedFiles(ctx), 'delivery-native-open: changed files');
    }

    exports.apply = apply;
    exports.inject = ['slots', 'remote'];
    return module.exports;
  },
});
