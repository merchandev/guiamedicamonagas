'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { animate, useInView, useMotionValue, useTransform, motion } from 'framer-motion';

/**
 * Número que cuenta hacia arriba al aparecer en pantalla.
 *
 * El HTML del servidor trae el número real (buscadores, vistas previas de
 * enlaces, lectores de pantalla y navegadores sin JavaScript nunca ven un 0).
 * En el navegador, solo si el número está fuera de pantalla al cargar, se
 * pone en 0 sin que se vea y se anima cuando aparece.
 */
export function Counter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const motionValue = useMotionValue(value);
  const rounded = useTransform(motionValue, (v) => `${Math.round(v)}${suffix}`);
  const armed = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const { top, bottom } = el.getBoundingClientRect();
    if (top >= window.innerHeight || bottom <= 0) {
      motionValue.set(0);
      armed.current = true;
    }
  }, [motionValue]);

  useEffect(() => {
    if (!armed.current) {
      motionValue.set(value);
      return;
    }
    if (!inView) return;
    const controls = animate(motionValue, value, { duration: 1.2, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [inView, value, motionValue]);

  return <motion.span ref={ref}>{rounded}</motion.span>;
}
