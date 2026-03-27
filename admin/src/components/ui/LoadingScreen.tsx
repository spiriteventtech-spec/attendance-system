// src/components/ui/LoadingScreen.tsx
import React from 'react';
import { motion } from 'framer-motion';

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-[#F5F5F7] z-50 flex flex-col items-center justify-center">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-6"
      >
        <div className="w-16 h-16 relative">
          <div className="absolute inset-0 border-4 border-[#007AFF]/10 rounded-full" />
          <motion.div 
            className="absolute inset-0 border-4 border-t-[#007AFF] rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[11px] font-bold text-[#86868B] uppercase tracking-[0.2em]">Synchronizing</span>
          <span className="text-xl font-bold text-[#1D1D1F] tracking-tight mt-1">EventsTrack Admin</span>
        </div>
      </motion.div>
    </div>
  );
}
