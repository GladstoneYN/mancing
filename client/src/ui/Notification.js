/**
 * Notification — Static toast notification system.
 * Usage: Notification.show(container, 'You caught a fish!', 'success')
 *
 * Supports types: info, success, warning, danger, common, uncommon, rare, epic, legendary
 * Max 5 visible toasts — oldest removed when cap is exceeded.
 * Toasts auto-dismiss after 3.5s with a slide-out animation.
 */

const MAX_TOASTS = 5;
const DISMISS_MS = 3500;
const ANIM_OUT_MS = 300;

// Icon mapping for semantic types
const ICONS = {
  info:      'ℹ️',
  success:   '✅',
  warning:   '⚠️',
  danger:    '❌',
  common:    '🐟',
  uncommon:  '🐟',
  rare:      '🐠',
  epic:      '🌟',
  legendary: '🏆',
};

export class Notification {
  /**
   * Show a toast notification.
   * @param {HTMLElement} container — #notification-container
   * @param {string} message — notification text
   * @param {string} [type='info'] — toast type (info, success, warning, danger, common-legendary)
   * @returns {HTMLElement} the toast element
   */
  static show(container, message, type = 'info') {
    if (!container) return null;

    // Enforce max visible toasts — remove oldest
    while (container.children.length >= MAX_TOASTS) {
      const oldest = container.firstChild;
      if (oldest) {
        // Clear its timeout so we don't double-remove
        if (oldest._dismissTimeout) clearTimeout(oldest._dismissTimeout);
        oldest.remove();
      }
    }

    // Build toast
    const toast = document.createElement('div');
    toast.className = `toast glass toast-${type}`;

    // Icon
    const icon = ICONS[type] || ICONS.info;
    const iconSpan = document.createElement('span');
    iconSpan.textContent = icon;
    iconSpan.style.cssText = 'font-size: 1.1rem; flex-shrink: 0;';
    toast.appendChild(iconSpan);

    // Message text
    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    textSpan.style.cssText = 'flex: 1;';
    toast.appendChild(textSpan);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = 'background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1rem; padding: 0 0 0 var(--sp-sm); line-height: 1; flex-shrink: 0;';
    closeBtn.addEventListener('click', () => dismiss());
    toast.appendChild(closeBtn);

    container.appendChild(toast);

    // Auto-dismiss
    const dismiss = () => {
      if (toast._dismissed) return;
      toast._dismissed = true;
      if (toast._dismissTimeout) clearTimeout(toast._dismissTimeout);

      toast.classList.add('removing');
      setTimeout(() => {
        if (toast.parentNode) toast.remove();
      }, ANIM_OUT_MS);
    };

    toast._dismissTimeout = setTimeout(dismiss, DISMISS_MS);

    return toast;
  }
}
