import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { Flip } from 'gsap/Flip';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(CustomEase, Flip, useGSAP);

CustomEase.create('zftm', '0.32, 0.72, 0, 1');
CustomEase.create('zftm-soft', '0.22, 1, 0.36, 1');
CustomEase.create('zftm-in', '0.5, 0, 0.75, 0');

gsap.defaults({ ease: 'zftm', duration: 0.45 });

export const DUR = {
  micro: 0.18,
  ui: 0.32,
  layout: 0.5,
  hero: 0.8,
} as const;

const reduceQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

export function prefersReducedMotion(): boolean {
  return reduceQuery?.matches ?? false;
}

export function dur(seconds: number): number {
  return prefersReducedMotion() ? 0 : seconds;
}

export { gsap, Flip, useGSAP };
