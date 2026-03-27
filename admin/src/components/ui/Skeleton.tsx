// src/components/ui/Skeleton.tsx
import React from 'react';
import clsx from 'clsx';

export interface SkeletonProps {
  className?: string;
  variant?: 'rectangular' | 'circular' | 'text';
}

export function Skeleton({ className, variant = 'rectangular' }: SkeletonProps) {
  return (
    <div 
      className={clsx(
        "animate-pulse bg-black/[0.03]",
        variant === 'circular' ? "rounded-full" : "rounded-2xl",
        className
      )} 
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white rounded-[24px] p-6 border border-black/5 shadow-premium space-y-4">
      <div className="flex items-center gap-4">
        <Skeleton variant="circular" className="w-10 h-10" />
        <div className="space-y-2">
          <Skeleton className="w-24 h-3" />
          <Skeleton className="w-32 h-5" />
        </div>
      </div>
      <div className="space-y-2 pt-4">
        <Skeleton className="w-full h-40" />
      </div>
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="bg-white rounded-[24px] p-8 border border-black/5 shadow-premium space-y-3">
          <Skeleton className="w-24 h-3" />
          <Skeleton className="w-32 h-8" />
        </div>
      ))}
    </div>
  );
}
