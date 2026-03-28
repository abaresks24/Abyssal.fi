'use client';
import React from 'react';
import { useOptionChain } from '@/hooks/useOptionChain';
import { useOptionBuilder } from '@/hooks/useOptionBuilder';
import { computeStrikes } from '@/lib/constants';
import type { Market } from '@/types';

interface Props { spot: number; iv: number; }

function fmtPremium(v: number): string {
  if (v < 0.01) return v.toFixed(4);
  if (v < 1)    return v.toFixed(2);
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function OptionChain({ spot, iv }: Props) {
  const { market, side, strike, expiry, setStrike, setSide } = useOptionBuilder();
  const chain   = useOptionChain(market as Market, spot, iv);
  const strikes = spot > 0 ? computeStrikes(spot) : [];
  const atmStrike = strikes[2] ?? 0; // index 2 = 0% offset = ATM

  const calls = chain.filter(s => s.side === 'call' && s.expiry === expiry);
  const puts  = chain.filter(s => s.side === 'put'  && s.expiry === expiry);

  const headerCell = (label: string, align: 'left' | 'right' = 'right') => (
    <th style={{
      padding: '4px 8px', fontSize: 9, color: 'var(--text3)', fontWeight: 400,
      textAlign: align, letterSpacing: '0.06em', textTransform: 'uppercase',
      borderBottom: '1px solid var(--border)',
    }}>
      {label}
    </th>
  );

  return (
    <div style={{ display: 'flex', minHeight: 0 }}>

      {/* Calls */}
      <div style={{ flex: 1, overflow: 'auto', borderRight: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{headerCell('Δ')}{headerCell('IV')}{headerCell('Premium')}{headerCell('Strike', 'left')}</tr>
          </thead>
          <tbody>
            {strikes.map((stk) => {
              const s    = calls.find(c => c.strike === stk);
              const isAtm  = stk === atmStrike;
              const isSel  = side === 'call' && strike === stk;
              return (
                <tr
                  key={stk}
                  onClick={() => { setStrike(stk); setSide('call'); }}
                  style={{
                    cursor: 'pointer',
                    background: isSel ? 'var(--cyan-dim)' : isAtm ? 'var(--amber-dim)' : 'transparent',
                    borderLeft: `2px solid ${isSel ? 'var(--cyan)' : 'transparent'}`,
                  }}
                >
                  <td className="mono" style={{ padding: '5px 8px', fontSize: 10, color: 'var(--text2)', textAlign: 'right' }}>
                    {s ? s.delta.toFixed(2) : '—'}
                  </td>
                  <td className="mono" style={{ padding: '5px 8px', fontSize: 10, color: 'var(--text2)', textAlign: 'right' }}>
                    {s ? `${(s.iv * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td className="mono" style={{ padding: '5px 8px', fontSize: 11, color: 'var(--green)', textAlign: 'right', fontWeight: 500 }}>
                    {s ? `$${fmtPremium(s.premium)}` : '—'}
                  </td>
                  <td className="mono" style={{ padding: '5px 8px', fontSize: 11, color: isAtm ? 'var(--amber)' : 'var(--text)', textAlign: 'left' }}>
                    ${stk.toLocaleString('en-US')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Puts */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{headerCell('Strike', 'left')}{headerCell('Premium')}{headerCell('IV')}{headerCell('Δ')}</tr>
          </thead>
          <tbody>
            {strikes.map((stk) => {
              const s    = puts.find(p => p.strike === stk);
              const isAtm  = stk === atmStrike;
              const isSel  = side === 'put' && strike === stk;
              return (
                <tr
                  key={stk}
                  onClick={() => { setStrike(stk); setSide('put'); }}
                  style={{
                    cursor: 'pointer',
                    background: isSel ? 'var(--cyan-dim)' : isAtm ? 'var(--amber-dim)' : 'transparent',
                    borderRight: `2px solid ${isSel ? 'var(--cyan)' : 'transparent'}`,
                  }}
                >
                  <td className="mono" style={{ padding: '5px 8px', fontSize: 11, color: isAtm ? 'var(--amber)' : 'var(--text)', textAlign: 'left' }}>
                    ${stk.toLocaleString('en-US')}
                  </td>
                  <td className="mono" style={{ padding: '5px 8px', fontSize: 11, color: 'var(--red)', textAlign: 'right', fontWeight: 500 }}>
                    {s ? `$${fmtPremium(s.premium)}` : '—'}
                  </td>
                  <td className="mono" style={{ padding: '5px 8px', fontSize: 10, color: 'var(--text2)', textAlign: 'right' }}>
                    {s ? `${(s.iv * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td className="mono" style={{ padding: '5px 8px', fontSize: 10, color: 'var(--text2)', textAlign: 'right' }}>
                    {s ? s.delta.toFixed(2) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
