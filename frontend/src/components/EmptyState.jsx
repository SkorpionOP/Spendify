import React from 'react';
import { Box, Sparkles } from 'lucide-react';

export function EmptyState({ icon: Icon = Box, title = "No data found", subtitle = "Try adjusting your filters or adding new records.", ...props }) {
  return (
    <div className="empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 1rem', textAlign: 'center', opacity: 0.8, ...props.style }}>
      <div style={{ position: 'relative', width: '72px', height: '72px', marginBottom: '1.5rem' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, var(--primary), var(--secondary))', opacity: 0.15, borderRadius: '50%', filter: 'blur(10px)' }}></div>
        <div style={{ position: 'absolute', inset: '6px', background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--glass-inner)' }}>
          <Icon size={28} color="var(--text-secondary)" />
        </div>
        <Sparkles size={14} color="var(--primary)" style={{ position: 'absolute', top: 0, right: '-5px', opacity: 0.6 }} />
      </div>
      <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fff', marginBottom: '0.4rem', letterSpacing: '-0.02em' }}>{title}</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', maxWidth: '280px', margin: 0, lineHeight: 1.5 }}>{subtitle}</p>
    </div>
  );
}
