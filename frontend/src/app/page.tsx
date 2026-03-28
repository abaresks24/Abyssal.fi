import dynamic from 'next/dynamic';

const TradingApp = dynamic(() => import('@/components/layout/TradingLayout'), { ssr: false });

export default function Page() {
  return <TradingApp />;
}
