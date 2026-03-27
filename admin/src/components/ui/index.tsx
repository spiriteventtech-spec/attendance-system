// src/components/ui/index.tsx
import React from 'react';
import { X, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { motion } from 'framer-motion';

// ── Spinner ──────────────────────────────────────────────────
// ── Spinner ──────────────────────────────────────────────────
export const Spinner = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const sz = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-8 h-8' }[size];
  return <Loader2 className={clsx(sz, 'animate-spin text-[#007AFF]')} />;
};

// ── Badge ─────────────────────────────────────────────────────
const badgeVariants: Record<string, string> = {
  active:     'bg-[#34C759]/10 text-[#34C759]',
  completed:  'bg-[#34C759]/10 text-[#34C759]',
  overridden: 'bg-[#FF9500]/10 text-[#FF9500]',
  frozen:     'bg-black/5 text-black/40',
  archived:   'bg-black/5 text-black/20',
  inside:     'bg-[#007AFF]/10 text-[#007AFF]',
  outside:    'bg-[#FF3B30]/10 text-[#FF3B30]',
  admin:      'bg-[#5856D6]/10 text-[#5856D6]',
  staff:      'bg-black/5 text-black/60',
};

export const Badge = ({ label, variant }: { label: string; variant?: string }) => (
  <span className={clsx(
    'inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-tight transition-all duration-200',
    badgeVariants[variant || label.toLowerCase()] || 'bg-black/5 text-black/40'
  )}>
    {label}
  </span>
);

// ── Modal ─────────────────────────────────────────────────────
export const Modal = ({
  open, onClose, title, children, wide = false,
}: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; wide?: boolean;
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        className="absolute inset-0 bg-black/20 backdrop-blur-md" 
        onClick={onClose} 
      />
      <motion.div 
        initial={{ scale: 0.98, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className={clsx(
          'relative bg-white rounded-[28px] w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-black/[0.03]',
          wide ? 'max-w-4xl' : 'max-w-lg'
        )}
      >
        <div className="flex items-center justify-between px-8 py-6 border-b border-black/[0.03]">
          <h2 className="text-lg font-bold text-[#1D1D1F] tracking-tight">{title}</h2>
          <button onClick={onClose} className="p-2 bg-black/5 rounded-full text-[#86868B] hover:text-[#1D1D1F] hover:bg-black/10 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-8 overflow-y-auto">{children}</div>
      </motion.div>
    </div>
  );
};

// ── Stat Card ─────────────────────────────────────────────────
export const StatCard = ({
  label, value, sub, icon, color = 'blue',
}: {
  label: string; value: React.ReactNode; sub?: string;
  icon: React.ReactNode; color?: string;
}) => {
  const colorMap: Record<string, string> = {
    blue:   'text-[#007AFF] bg-[#007AFF]/5',
    green:  'text-[#34C759] bg-[#34C759]/5',
    amber:  'text-[#FF9500] bg-[#FF9500]/5',
    red:    'text-[#FF3B30] bg-[#FF3B30]/5',
    purple: 'text-[#AF52DE] bg-[#AF52DE]/5',
  };
  
  return (
    <div className="premium-card group">
      <div className="flex justify-between items-start mb-6">
        <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center transition-all', colorMap[color])}>
          {React.cloneElement(icon as React.ReactElement, { size: 20 })}
        </div>
      </div>
      <div>
        <span className="text-[11px] font-semibold text-[#86868B] uppercase tracking-wide">{label}</span>
        <p className="text-3xl font-bold text-[#1D1D1F] tracking-tight mt-0.5">{value}</p>
        {sub && <p className="text-[11px] text-[#A1A1A6] font-medium mt-1.5">{sub}</p>}
      </div>
    </div>
  );
};

// ── Stat Widget (iOS Style) ───────────────────────────────────
export const StatWidget = ({
  label, value, icon, color,
}: {
  label: string; value: React.ReactNode; icon: React.ReactNode; color: string;
}) => (
  <div className="premium-card !p-6 flex flex-col justify-between h-[160px] hover:scale-[1.02] active:scale-[0.98]">
    <div className="flex justify-between items-start">
      <div className={clsx("p-3 rounded-2xl")} style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
        {icon}
      </div>
    </div>
    <div className="mt-4">
      <p className="text-[12px] font-bold text-[#86868B] tracking-tight uppercase mb-1">{label}</p>
      <p className="text-4xl font-black text-[#1D1D1F] tracking-tighter" style={{ color }}>{value}</p>
    </div>
  </div>
);

// ── Confirm Dialog ────────────────────────────────────────────
export const ConfirmDialog = ({
  open, onClose, onConfirm, title, message, variant = 'danger', loading = false,
}: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  title: string; message: string; variant?: 'danger' | 'warning';
  loading?: boolean;
}) => (
  <Modal open={open} onClose={onClose} title={title}>
    <p className="text-sm text-[#86868B] mb-8 font-medium leading-relaxed">{message}</p>
    <div className="flex gap-3 justify-end">
      <button className="btn-apple-secondary" onClick={onClose} disabled={loading}>Cancel</button>
      <button
        className={clsx(
          'btn-apple shadow-none',
          variant === 'danger' ? 'bg-[#FF3B30]' : 'bg-[#FF9500]'
        )}
        onClick={onConfirm}
        disabled={loading}
      >
        {loading ? <Spinner size="sm" /> : 'Confirm'}
      </button>
    </div>
  </Modal>
);

// ── Empty State ───────────────────────────────────────────────
export const EmptyState = ({ message = 'No data found' }: { message?: string }) => (
  <div className="flex flex-col items-center justify-center p-12 text-[#86868B] bg-white rounded-3xl border border-black/5 mx-auto max-w-2xl my-8">
    <div className="w-16 h-16 bg-[#F5F5F7] rounded-full flex items-center justify-center mb-4">
      <span className="text-2xl opacity-60">📂</span>
    </div>
    <h3 className="text-[#1D1D1F] font-semibold text-lg mb-1 tracking-tight">No Results Found</h3>
    <p className="text-sm font-medium tracking-tight text-center max-w-xs">{message}</p>
  </div>
);

// ── Filter Bar ────────────────────────────────────────────────
export const FilterInput = ({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) => (
  <div className="flex-1 min-w-[140px]">
    <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">{label}</label>
    <input
      type={type}
      className="input-apple"
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  </div>
);

export const FilterSelect = ({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) => (
  <div className="flex-1 min-w-[140px]">
    <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">{label}</label>
    <div className="relative">
      <select
        className="input-apple appearance-none pr-10"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[#86868B]">
        <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20">
          <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
        </svg>
      </div>
    </div>
  </div>
);
