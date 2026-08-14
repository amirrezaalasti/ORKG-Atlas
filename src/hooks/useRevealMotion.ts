import { useReducedMotion } from 'motion/react';

/** whileInView reveal props; no-ops when the user prefers reduced motion. */
export const useRevealMotion = () => {
  const reduce = useReducedMotion();
  if (reduce) {
    return { initial: false as const };
  }
  return {
    initial: 'hidden' as const,
    whileInView: 'show' as const,
    viewport: { once: true, amount: 0.2 },
  };
};
