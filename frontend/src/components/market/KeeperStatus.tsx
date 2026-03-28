'use client';
import React, { useState, useEffect } from 'react';

export function KeeperStatus() {
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      // Simulate keeper heartbeat every 5 min
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const elapsed = Math.floor((Date.now() - lastUpdate) / 1000);

  return (
    <div style={{ padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
        Keeper
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>Status</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
            <span className="mono" style={{ fontSize: 11, color: 'var(--green)' }}>Active</span>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>IV updates</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text3)' }}>5 min</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>Settlement</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text3)' }}>30 s</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>Network</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text3)' }}>Devnet</span>
        </div>
      </div>
    </div>
  );
}
