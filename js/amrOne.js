const carousels = new WeakMap();
const tabListeners = new WeakMap();

export function getLanguage() {
    const language = localStorage.getItem("amr-one-language");
    if (language !== null && language !== "zh" && language !== "en") throw new Error("Invalid ONE language preference");
    return language ?? "zh";
}

export function setLanguage(language) {
    if (language !== "zh" && language !== "en") throw new Error("Invalid ONE language preference");
    localStorage.setItem("amr-one-language", language);
}

export function nextTabIndex(key, current, count) {
    if (key === "ArrowRight") return (current + 1) % count;
    if (key === "ArrowLeft") return (current + count - 1) % count;
    if (key === "Home") return 0;
    if (key === "End") return count - 1;
    return null;
}

export function attachTabs(root) {
    detachTabs(root);
    const listener = event => {
        const tab = event.target.closest('[role="tab"]');
        const list = tab?.closest('.report-theme-tabs[role="tablist"], .oh-tabs[role="tablist"]');
        if (!list || !root.contains(list)) return;
        const tabs = [...list.querySelectorAll('[role="tab"]')];
        const index = nextTabIndex(event.key, tabs.indexOf(tab), tabs.length);
        if (index === null) return;
        event.preventDefault();
        tabs[index].focus({ preventScroll: true });
        tabs[index].click();
    };
    root.addEventListener("keydown", listener);
    tabListeners.set(root, listener);
}

export function detachTabs(root) {
    const listener = tabListeners.get(root);
    if (listener) root.removeEventListener("keydown", listener);
    tabListeners.delete(root);
}

export function carouselPage(count, width, page = 0) {
    const perPage = width <= 767 ? 1 : width <= 1080 ? 2 : 4;
    const pages = Math.ceil(count / perPage);
    const current = Math.max(0, Math.min(page, pages - 1));
    return { perPage, pages, current, start: current * perPage, end: Math.min(count, (current + 1) * perPage) };
}

export function attachCarousel(root, english = false) {
    detachCarousel(root);
    const cards = [...root.querySelectorAll("[data-one-metric]")];
    const buttons = [...root.querySelectorAll("[data-one-page]")];
    const status = root.querySelector("[data-one-carousel-status]");
    if (!cards.length || !buttons.length || !status) throw new Error("ONE carousel markup is incomplete");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let state = carouselPage(cards.length, window.innerWidth);
    let hovered = false, focused = false, touchStart = null;
    const listeners = [];
    const listen = (target, name, action, options) => {
        target.addEventListener(name, action, options);
        listeners.push(() => target.removeEventListener(name, action, options));
    };
    const render = (announce = false) => {
        const focusedButton = buttons.includes(document.activeElement) ? document.activeElement : null;
        state = carouselPage(cards.length, window.innerWidth, state.current);
        root.style.setProperty("--one-metrics-columns", state.perPage);
        cards.forEach((card, index) => { card.hidden = index < state.start || index >= state.end; });
        buttons.forEach((button, index) => {
            button.hidden = index >= state.pages;
            if (index === state.current) button.setAttribute("aria-current", "true");
            else button.removeAttribute("aria-current");
        });
        if (focusedButton?.hidden) buttons[state.current]?.focus({ preventScroll: true });
        if (announce) status.textContent = english ? `Page ${state.current + 1} of ${state.pages}` : `第 ${state.current + 1} 頁，共 ${state.pages} 頁`;
    };
    const move = (step, announce) => {
        state.current = (state.current + step + state.pages) % state.pages;
        render(announce);
    };
    buttons.forEach((button, index) => listen(button, "click", () => { state.current = index; render(true); }));
    listen(root, "mouseenter", () => { hovered = true; });
    listen(root, "mouseleave", () => { hovered = false; });
    listen(root, "focusin", () => { focused = true; });
    listen(root, "focusout", event => { focused = root.contains(event.relatedTarget); });
    listen(root, "touchstart", event => { touchStart = event.touches[0]?.clientX ?? null; }, { passive: true });
    listen(root, "touchend", event => {
        const end = event.changedTouches[0]?.clientX;
        if (touchStart !== null && end !== undefined && Math.abs(end - touchStart) > 40) move(end < touchStart ? 1 : -1, true);
        touchStart = null;
    }, { passive: true });
    listen(window, "resize", () => render());
    listen(reduced, "change", () => render());
    const timer = setInterval(() => {
        if (!reduced.matches && !hovered && !focused && !document.hidden) move(1, false);
    }, 7000);
    carousels.set(root, () => { clearInterval(timer); listeners.forEach(remove => remove()); });
    render();
}

export function detachCarousel(root) {
    carousels.get(root)?.();
    carousels.delete(root);
}

export async function copyChecksum(value) {
    if (!/^[a-f0-9]{32}$/i.test(value)) throw new Error("Invalid MD5 checksum");
    if (!navigator.clipboard) throw new Error("Clipboard requires HTTPS or localhost");
    await navigator.clipboard.writeText(value);
}
