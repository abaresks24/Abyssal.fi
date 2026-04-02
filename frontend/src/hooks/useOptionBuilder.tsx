'use client';
import React, { createContext, useCallback, useContext, useMemo, useReducer } from 'react';
import type { Market, Side, Action, Expiry, OptionBuilderState } from '@/types';

type BuilderAction =
  | { type: 'SET_MARKET'; market: Market }
  | { type: 'SET_SIDE';   side: Side }
  | { type: 'SET_ACTION'; action: Action }
  | { type: 'SET_STRIKE'; strike: number }
  | { type: 'SET_EXPIRY'; expiry: Expiry }
  | { type: 'SET_SIZE';   size: number };

const INITIAL: OptionBuilderState = {
  market: 'BTC',
  side:   'call',
  action: 'buy',
  strike: 0,
  expiry: '7D',
  size:   0.1,
};

function reducer(state: OptionBuilderState, action: BuilderAction): OptionBuilderState {
  switch (action.type) {
    case 'SET_MARKET': return { ...state, market: action.market, strike: 0 };
    case 'SET_SIDE':   return { ...state, side: action.side };
    case 'SET_ACTION': return { ...state, action: action.action };
    case 'SET_STRIKE': return { ...state, strike: action.strike };
    case 'SET_EXPIRY': return { ...state, expiry: action.expiry };
    case 'SET_SIZE':   return { ...state, size: action.size };
    default:           return state;
  }
}

interface BuilderContext extends OptionBuilderState {
  setMarket:  (m: Market)  => void;
  setSide:    (s: Side)    => void;
  setAction:  (a: Action)  => void;
  setStrike:  (k: number)  => void;
  setExpiry:  (e: Expiry)  => void;
  setSize:    (n: number)  => void;
}

const Ctx = createContext<BuilderContext | null>(null);

export function OptionBuilderProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const setMarket = useCallback((market: Market)  => dispatch({ type: 'SET_MARKET', market }), []);
  const setSide   = useCallback((side: Side)       => dispatch({ type: 'SET_SIDE', side }), []);
  const setAction = useCallback((action: Action)   => dispatch({ type: 'SET_ACTION', action }), []);
  const setStrike = useCallback((strike: number)   => dispatch({ type: 'SET_STRIKE', strike }), []);
  const setExpiry = useCallback((expiry: Expiry)   => dispatch({ type: 'SET_EXPIRY', expiry }), []);
  const setSize   = useCallback((size: number)     => dispatch({ type: 'SET_SIZE', size }), []);

  const value = useMemo(
    () => ({ ...state, setMarket, setSide, setAction, setStrike, setExpiry, setSize }),
    [state, setMarket, setSide, setAction, setStrike, setExpiry, setSize],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOptionBuilder(): BuilderContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useOptionBuilder must be inside OptionBuilderProvider');
  return ctx;
}
