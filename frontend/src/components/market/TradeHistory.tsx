'use client';
import React from 'react';

export function TradeHistory() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: 11 }}>Options Flow</span>
        <span style={{ color: '#526a82', fontSize: 10 }}>—</span>
      </div>
      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '45px 55px 1fr 60px',
        padding: '3px 8px', fontSize: 9, color: '#526a82',
        borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0,
      }}>
        <span>Time</span><span>Wallet</span><span>Strike · Exp</span><span style={{ textAlign: 'right' }}>Prem</span>
      </div>
      {/* Empty state */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#526a82', fontSize: 11 }}>No trades yet</span>
      </div>
    </div>
  );
}
