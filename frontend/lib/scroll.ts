// Programmatic smooth scrolling on scroll-snap containers silently no-ops in
// some engines (and under reduced-motion emulation). Try smooth, verify
// movement a beat later, and land instantly if the animation never started.

export function snapScrollTo(
  el: HTMLElement,
  opts: { left?: number; top?: number },
): void {
  const axis = opts.left != null ? ("scrollLeft" as const) : ("scrollTop" as const);
  const target = opts.left ?? opts.top ?? 0;
  const start = el[axis];
  if (Math.abs(target - start) < 2) return;
  el.scrollTo({ ...opts, behavior: "smooth" });
  window.setTimeout(() => {
    if (Math.abs(el[axis] - start) < 2) el.scrollTo(opts);
  }, 140);
}
