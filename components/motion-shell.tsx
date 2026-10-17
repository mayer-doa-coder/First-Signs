"use client";

import { AnimatePresence, MotionConfig, motion, useReducedMotion, useScroll, useSpring } from "motion/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const smoothSpring = { type: "spring" as const, stiffness: 260, damping: 28, mass: 0.8 };

/**
 * A single motion boundary keeps page changes consistent and lightweight.
 * MotionConfig honours the operating-system reduced-motion preference, while
 * the progress rail gives long patient-facing pages a quiet sense of place.
 */
export function MotionShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 180,
    damping: 32,
    restDelta: 0.001,
    skipInitialAnimation: true,
  });

  return (
    <MotionConfig reducedMotion="user" transition={smoothSpring}>
      <motion.div
        className="page-progress"
        aria-hidden="true"
        style={{ scaleX: reduceMotion ? scrollYProgress : smoothProgress }}
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          id="main-content"
          key={pathname}
          data-route-transition
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
          transition={reduceMotion ? { duration: 0 } : smoothSpring}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
}
