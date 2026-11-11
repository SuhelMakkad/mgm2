/**
 * Site-wide behaviour: header state, mobile menu, scroll reveals and count-up figures.
 * Everything here is an enhancement. Pages read and navigate correctly without it.
 */

const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

root.classList.add('js');

/* Header: gains a solid background once the page has scrolled. */

const header = document.querySelector<HTMLElement>('[data-header]');

const syncHeader = () => {
  header?.toggleAttribute('data-scrolled', window.scrollY > 12);
};

syncHeader();
window.addEventListener('scroll', syncHeader, { passive: true });

/* Mobile menu */

const menuToggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
const menu = document.querySelector<HTMLElement>('[data-menu]');

const setMenu = (open: boolean) => {
  if (!header || !menuToggle || !menu) return;

  header.toggleAttribute('data-open', open);
  menu.toggleAttribute('inert', !open);

  menuToggle.setAttribute('aria-expanded', String(open));
  root.style.overflow = open ? 'hidden' : '';
};

menuToggle?.addEventListener('click', () => {
  setMenu(menuToggle.getAttribute('aria-expanded') !== 'true');
});

menu?.addEventListener('click', (event) => {
  const link = (event.target as Element).closest('a');

  if (link) setMenu(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || menuToggle?.getAttribute('aria-expanded') !== 'true') return;

  setMenu(false);
  menuToggle.focus();
});

window.matchMedia('(min-width: 64rem)').addEventListener('change', (event) => {
  if (event.matches) setMenu(false);
});

/* Count-up figures: <span data-count="47" data-suffix="+">47+</span> */

const runCount = (element: HTMLElement) => {
  const target = Number(element.dataset.count);
  const suffix = element.dataset.suffix ?? '';

  if (reduceMotion || !Number.isFinite(target)) return;

  const duration = 1400;
  const start = performance.now();

  const tick = (now: number) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 4);

    element.textContent = `${Math.round(target * eased)}${suffix}`;

    if (progress < 1) requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
};

/* Scroll reveal */

const revealTargets = document.querySelectorAll<HTMLElement>('[data-reveal], [data-count]');

const reveal = (element: HTMLElement) => {
  element.classList.add('is-in');

  if (element.dataset.count) runCount(element);
};

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        reveal(entry.target as HTMLElement);
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0.06 },
  );

  revealTargets.forEach((element) => observer.observe(element));
} else {
  revealTargets.forEach(reveal);
}
