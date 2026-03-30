import React from 'react';

interface Props {
  size?: number;
}

export function LoadingSpinner({ size = 32 }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.svg"
      alt=""
      width={size}
      height={size}
      style={{
        borderRadius: '50%',
        display: 'block',
        animation: 'spin 1.2s linear infinite',
      }}
    />
  );
}
