'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';

export default function Loading() {
  return (
    <motion.main
      className="fixed inset-0 z-[9999] overflow-hidden bg-black"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* Full-screen splash image */}
      <Image
        src="/icon-512.png"
        alt="Iromwing Monarch"
        fill
        priority
        quality={100}
        className="object-cover select-none"
      />

      {/* Soft golden overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/25" />

      {/* Fade animation */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          duration: 1.2,
          ease: "easeOut",
        }}
      />

      {/* Bottom loading indicator */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4">
        <motion.div
          className="h-1 w-44 overflow-hidden rounded-full bg-white/20"
        >
          <motion.div
            className="h-full w-full bg-amber-400"
            initial={{ x: "-100%" }}
            animate={{ x: "100%" }}
            transition={{
              repeat: Infinity,
              duration: 1.4,
              ease: "linear",
            }}
          />
        </motion.div>

        <motion.p
          className="text-sm font-medium tracking-[0.3em] text-white/90"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{
            repeat: Infinity,
            duration: 1.6,
          }}
        >
          LOADING...
        </motion.p>
      </div>
    </motion.main>
  );
}