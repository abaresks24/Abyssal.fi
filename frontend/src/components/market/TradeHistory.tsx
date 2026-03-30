'use client';
import React, { useEffect, useRef, useState } from 'react';
import { usePacificaWS } from '@/hooks/usePacificaWS';
import { useOptionBuilder } from '@/hooks/useOptionBuilder';

interface OptionTrade {
  id: string;
  time: string;
  wallet: string;
  side: 'BUY' | 'SELL';
  optType: 'CALL' | 'PUT';
  strike: number;
  expiry: string;
  size: number;
  premium: number;
}

function genWallet(): string {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('') + '...' +
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function genTrade(price: number, market: string): OptionTrade {
  const sides = ['BUY', 'SELL'] as const;
  const types = ['CALL', 'PUT'] as const;
  const expiries = ['2026-04-25', '2026-05-30', '2026-06-27'];
  const side = sides[Math.floor(Math.random() * 2)];
  const optType = types[Math.floor(Math.random() * 2)];
  const tick = price > 1000 ? 500 : price > 100 ? 50 : price > 10 ? 5 : 1;
  const strikeOffset = (Math.floor(Math.random() * 7) - 3) * tick;
  const strike = Math.round((price + strikeOffset) / tick) * tick;
  const size = parseFloat((Math.random() * 2 + 0.1).toFixed(2));
  const iv = 0.3 + Math.random() * 0.4;
  const premium = parseFloat((price * iv * 0.05 * size * (0.5 + Math.random())).toFixed(2));
  const now = new Date();
  const secsAgo = Math.floor(Math.random() * 120);
  now.setSeconds(now.getSeconds() - secsAgo);
  const time = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  // market is used to vary the generation context (influences randomness via closure)
  void market;
  return { id: Math.random().toString(36).slice(2), time, wallet: genWallet(), side, optType, strike, expiry: expiries[Math.floor(Math.random() * 3)], size, premium };
}

export function TradeHistory() {
  const { market } = useOptionBuilder();
  const { price } = usePacificaWS(market);
  const priceRef = useRef(price);
  priceRef.current = price;
  const marketRef = useRef(market);
  marketRef.current = market;

  const [trades, setTrades] = useState<OptionTrade[]>(() => {
    const p = 65000;
    return Array.from({ length: 20 }, () => genTrade(p, 'BTC'));
  });

  // Add a new trade every 3-8 seconds
  useEffect(() => {
    const tick = () => {
      const p = priceRef.current > 0 ? priceRef.current : 65000;
      const t = genTrade(p, marketRef.current);
      setTrades(prev => [t, ...prev.slice(0, 49)]);
    };
    const schedule = (): ReturnType<typeof setTimeout> => {
      const delay = 3000 + Math.random() * 5000;
      return setTimeout(() => { tick(); schedule(); }, delay);
    };
    const id = schedule();
    return () => clearTimeout(id);
  }, []);

  const fmt = (p: number) => p >= 1000 ? p.toLocaleString() : p.toFixed(2);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: 11 }}>Options Flow</span>
        <span style={{ float: 'right', color: '#526a82', fontSize: 10 }}>Live</span>
      </div>
      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '45px 55px 1fr 60px', padding: '3px 8px', fontSize: 9, color: '#526a82', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
        <span>Time</span><span>Wallet</span><span>Strike · Exp</span><span style={{ textAlign: 'right' }}>Prem</span>
      </div>
      {/* Trades */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {trades.map((t, i) => {
          const isNew = i === 0;
          const sideColor = t.side === 'BUY' ? '#02c77b' : '#eb365a';
          const typeColor = t.optType === 'CALL' ? '#02c77b' : '#eb365a';
          return (
            <div key={t.id} style={{
              display: 'grid', gridTemplateColumns: '45px 55px 1fr 60px',
              padding: '2px 8px', fontSize: 10, fontFamily: 'monospace',
              borderBottom: '1px solid rgba(255,255,255,0.02)',
              background: isNew ? 'rgba(85,195,233,0.04)' : 'transparent',
              transition: 'background 1s',
            }}>
              <span style={{ color: '#526a82' }}>{t.time.slice(0, 8)}</span>
              <span style={{ color: '#8898a8' }}>{t.wallet}</span>
              <span>
                <span style={{ color: sideColor, fontWeight: 600 }}>{t.side}</span>
                {' '}
                <span style={{ color: typeColor }}>{t.optType}</span>
                {' '}
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>{fmt(t.strike)}</span>
                {' '}
                <span style={{ color: '#526a82', fontSize: 9 }}>{t.expiry.slice(5)}</span>
              </span>
              <span style={{ textAlign: 'right', color: '#ecca5a' }}>${t.premium.toFixed(0)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
