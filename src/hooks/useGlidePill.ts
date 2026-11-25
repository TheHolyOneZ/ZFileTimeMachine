import { useLayoutEffect, useRef, type DependencyList, type RefObject } from 'react';
import { gsap, dur } from '@/lib/motion';

export function useGlidePill(
  containerRef: RefObject<HTMLElement | null>,
  pillRef: RefObject<HTMLElement | null>,
  selector: string,
  deps: DependencyList,
) {
  const shown = useRef(false);

  useLayoutEffect(() => {
    const root = containerRef.current;
    const pill = pillRef.current;
    if (!root || !pill) return;

    function place(animate: boolean) {
      if (!root || !pill) return;
      const target = root.querySelector<HTMLElement>(selector);
      if (!target) {
        if (shown.current) gsap.to(pill, { autoAlpha: 0, duration: dur(0.2), ease: 'power1.out', overwrite: 'auto' });
        shown.current = false;
        return;
      }
      let x = 0;
      let y = 0;
      for (let el: HTMLElement | null = target; el && el !== root; el = el.offsetParent as HTMLElement | null) {
        x += el.offsetLeft;
        y += el.offsetTop;
      }
      const to = { x, y, width: target.offsetWidth, height: target.offsetHeight };
      if (!shown.current || !animate) {
        const first = !shown.current;
        gsap.killTweensOf(pill, 'x,y,width,height,scale');
        gsap.set(pill, { ...to, scale: 1 });
        if (first) gsap.fromTo(pill, { autoAlpha: 0 }, { autoAlpha: 1, duration: dur(0.3), ease: 'zftm', overwrite: 'auto' });
        else gsap.set(pill, { autoAlpha: 1 });
        shown.current = true;
        return;
      }
      gsap.to(pill, { ...to, autoAlpha: 1, scale: 1, duration: dur(0.5), ease: 'zftm', overwrite: 'auto' });
    }

    place(true);
    let frame = 0;
    const settle = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => place(false)); };
    const ro = new ResizeObserver(settle);
    ro.observe(root);
    Array.from(root.children).forEach((c) => ro.observe(c));
    const mo = new MutationObserver((records) => {
      if (records.some((r) => r.target !== pill)) settle();
    });
    mo.observe(root, { childList: true, subtree: true });
    return () => { cancelAnimationFrame(frame); ro.disconnect(); mo.disconnect(); };
  }, deps);
}
