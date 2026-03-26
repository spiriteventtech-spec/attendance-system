import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface FloatingCardProps {
  title: string;
  value: string;
  gradient: "purple-blue" | "orange-pink";
  icon: ReactNode;
  delay?: number;
}

export const PremiumFloatingCard = ({ title, value, gradient, icon, delay = 0 }: FloatingCardProps) => {
  // Map the gradients to match the reference image exactly
  const gradientClass = 
    gradient === "purple-blue" 
      ? "from-brand-purple to-brand-blue shadow-brand-purple/20"
      : "from-brand-orange to-brand-rose shadow-brand-rose/20";

  return (
    <motion.div
      // This creates the organic "floating" animation from your reference image
      animate={{ y: [0, -8, 0] }}
      transition={{ 
        duration: 4, 
        repeat: Infinity, 
        ease: "easeInOut",
        delay: delay 
      }}
      className="relative p-[2px] rounded-3xl group"
    >
      {/* The glowing gradient border effect */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradientClass} rounded-3xl opacity-50 group-hover:opacity-100 transition-opacity duration-500`} />
      
      {/* The main Soft 3D Card Surface */}
      <div className="relative h-full bg-[#2D2E3D] rounded-3xl p-6 shadow-soft-3d backdrop-blur-xl flex items-center gap-6 border border-white/[0.03]">
        
        {/* Glowing Circular Indicator (Like the 3.8 / 4.7 rings in the image) */}
        <div className={`relative flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br ${gradientClass} shadow-lg`}>
          {/* Inner dark circle to create the "ring" effect */}
          <div className="absolute inset-1 bg-[#2D2E3D] rounded-full flex items-center justify-center">
            <span className="text-white">
              {icon}
            </span>
          </div>
        </div>

        {/* Typography */}
        <div className="flex-1">
          <h3 className="text-gray-400 text-xs font-bold uppercase tracking-[0.2em]">{title}</h3>
          <p className="text-white text-3xl font-bold mt-1 tracking-tight">{value}</p>
        </div>
      </div>
    </motion.div>
  );
};
