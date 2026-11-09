export function getTextSize() {
    try { return localStorage.getItem('amr-text-size'); } catch { return null; }
}

export function setTextSize(size) {
    try { localStorage.setItem('amr-text-size', size); } catch { }
}

export function getCookieConsent() {
    return document.cookie.split('; ').find(cookie => cookie.startsWith('amr-cookie-consent='))?.split('=')[1] ?? null;
}

export function setCookieConsent(preference) {
    document.cookie = `amr-cookie-consent=${encodeURIComponent(preference)}; path=/; max-age=31536000; SameSite=Lax`;
}

export function scrollToTop() {
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    document.querySelector('.amr-layout #au')?.focus({ preventScroll: true });
}

const accessibilityListeners = new WeakMap();

export function attachAccessibility(root, receiver) {
    detachAccessibility(root);
    const listener = async event => {
        if (event.key !== 'Escape') return;
        const guide = event.target.closest('.amr-info-details[open], .amr-a11y-guide[open]') ?? root.querySelector('.amr-a11y-guide[open]');
        if (guide) {
            guide.open = false;
            guide.querySelector('summary').focus();
            event.preventDefault();
            return;
        }
        const menu = root.querySelector('.amr-menu-toggle[aria-expanded="true"]');
        if (menu && (event.target === menu || root.querySelector('#amr-navigation').contains(event.target))) {
            await receiver.invokeMethodAsync('CloseMenuFromKeyboard');
            menu.focus();
            event.preventDefault();
        }
    };
    root.addEventListener('keydown', listener);
    accessibilityListeners.set(root, listener);
}

export function detachAccessibility(root) {
    const listener = accessibilityListeners.get(root);
    if (listener) root.removeEventListener('keydown', listener);
    accessibilityListeners.delete(root);
}

export function downloadCsv(filename, content) {
    downloadFile(filename, content, 'text/csv;charset=utf-8');
}

export function downloadText(filename, content) {
    downloadFile(filename, content, 'text/plain;charset=utf-8');
}

function downloadFile(filename, content, type) {
    const url = URL.createObjectURL(new Blob(['\ufeff', content], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}