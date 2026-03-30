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
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
        <span style={{ color: '#526a82', fontSize: 11 }}>No trades yet</span>
        <span style={{ color: 'rgba(82,106,130,0.6)', fontSize: 10, textAlign: 'center', padding: '0 16px' }}>
          Protocol not yet live
        </span>
      </div>
    </div>
  );
}
