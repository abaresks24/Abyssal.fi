'use client';
import React, { useState } from 'react';
import { useOptionBuilder } from '@/hooks/useOptionBuilder';
import { EXPIRY_OPTIONS } from '@/lib/constants';

const PRESETS = EXPIRY_OPTIONS;

export function ExpirySelector() {
  const { expiry, setExpiry } = useOptionBuilder();
  const [customOpen, setCustomOpen] = useState(false);
  const [customVal, setCustomVal] = useState('');
  const [customUnit, setCustomUnit] = useState<'M' | 'H' | 'D'>('D');

  const isCustom = !PRESETS.includes(expiry);

  const handleCustomSubmit = () => {
    const val = parseInt(customVal, 10);
    if (val > 0) {
      setExpiry(`${val}${customUnit}`);
      setCustomOpen(false);
      setCustomVal('');
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '6px 12px',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
      flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 10, color: 'var(--text3)', marginRight: 6, letterSpacing: '0.06em' }}>EXPIRY</span>

      {/* Preset buttons */}
      {PRESETS.map(e => (
        <button
          key={e}
          onClick={() => { setExpiry(e); setCustomOpen(false); }}
          style={{
            padding: '2px 8px',
            borderRadius: 4,
            border: `1px solid ${expiry === e ? 'var(--cyan)' : 'var(--border2)'}`,
            background: expiry === e ? 'var(--cyan-dim)' : 'transparent',
            color: expiry === e ? 'var(--cyan)' : 'var(--text3)',
            fontSize: 11,
            fontFamily: 'var(--mono)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {e}
        </button>
      ))}

      {/* Custom button / input */}
      {customOpen ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <input
            type="number"
            min={1}
            value={customVal}
            onChange={e => setCustomVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCustomSubmit(); }}
            placeholder="#"
            autoFocus
            style={{
              width: 42, padding: '2px 6px', borderRadius: 4,
              border: '1px solid var(--cyan)', background: 'var(--bg3)',
              color: 'var(--cyan)', fontSize: 11, fontFamily: 'var(--mono)',
              textAlign: 'center',
            }}
          />
          <select
            value={customUnit}
            onChange={e => setCustomUnit(e.target.value as 'M' | 'H' | 'D')}
            style={{
              padding: '2px 4px', borderRadius: 4,
              border: '1px solid var(--border2)', background: 'var(--bg3)',
              color: 'var(--text)', fontSize: 11, fontFamily: 'var(--mono)',
            }}
          >
            <option value="M">min</option>
            <option value="H">hr</option>
            <option value="D">day</option>
          </select>
          <button
            onClick={handleCustomSubmit}
            style={{
              padding: '2px 6px', borderRadius: 4, border: 'none',
              background: 'var(--cyan)', color: '#0a121c',
              fontSize: 10, fontWeight: 600, cursor: 'pointer',
            }}
          >
            OK
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCustomOpen(true)}
          style={{
            padding: '2px 8px',
            borderRadius: 4,
            border: `1px solid ${isCustom ? 'var(--cyan)' : 'var(--border2)'}`,
            background: isCustom ? 'var(--cyan-dim)' : 'transparent',
            color: isCustom ? 'var(--cyan)' : 'var(--text3)',
            fontSize: 11,
            fontFamily: 'var(--mono)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {isCustom ? expiry : 'Custom'}
        </button>
      )}
    </div>
  );
}
