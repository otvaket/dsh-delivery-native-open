/**
 * dsh-delivery-native-open — browser half.
 *
 * The delivery card's primary click belongs to `ui-deliverables`' component, and
 * the client slot registry only supports additive cells or a wholesale cell
 * replacement. This plugin therefore takes the additive route: it occupies the
 * `deliverables.file.actions` list slot (the same owner `ui-open-in-app` uses),
 * mounts an invisible probe inside every delivery card, and intercepts the
 * card's own activation button on capture so the click performs the Host
 * desktop handoff instead of the Sidebar preview. It also renders a visible
 * preview button that replays the card's own activation, so the Sidebar
 * preview stays one click away.
 */
window.__ModuleLoader__.load({
  id: 'dsh-delivery-native-open',
  factory: (require) => {
    var module = { exports: {} }; var exports = module.exports;
    'use strict';

    const React = require('react');

    /** Attribute the card wrapper carries; the probe resolves its own card through it. */
    const CARD_ATTRIBUTE = '[data-presented-file]';
    /** The card's own activation button is its first direct child button. */
    const ACTIVATION_SELECTOR = ':scope > button';
    /** Lets the preview button replay the activation without being intercepted again. */
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
          // The preview control replays this activation; modifier clicks keep it too.
          if (replaying) return;
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
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
          const activation = card === null ? null : card.querySelector(ACTIVATION_SELECTOR);
          if (activation === null) return;
          replaying = true;
          try { activation.click(); } finally { replaying = false; }
        },
      }, React.createElement(PanelGlyph)));
    }

    /**
     * Register the stylesheet and the delivery-card probe.
     * @param {object} ctx - client plugin context providing `slots`.
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
    }

    exports.apply = apply;
    exports.inject = ['slots'];
    return module.exports;
  },
});
