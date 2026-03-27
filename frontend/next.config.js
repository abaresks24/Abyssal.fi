/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  webpack: (config) => {
    // Required for Solana/Anchor compatibility
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      url: require.resolve('url'),
      zlib: require.resolve('browserify-zlib'),
      http: require.resolve('stream-http'),
      https: require.resolve('https-browserify'),
      assert: require.resolve('assert'),
      os: require.resolve('os-browserify'),
      path: require.resolve('path-browserify'),
    };
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    return config;
  },
  env: {
    NEXT_PUBLIC_PACIFICA_API_URL: process.env.NEXT_PUBLIC_PACIFICA_API_URL || 'https://api.pacifica.finance',
    NEXT_PUBLIC_PACIFICA_WS_URL: process.env.NEXT_PUBLIC_PACIFICA_WS_URL || 'wss://ws.pacifica.finance',
    NEXT_PUBLIC_PROGRAM_ID: process.env.NEXT_PUBLIC_PROGRAM_ID || 'CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG',
    NEXT_PUBLIC_USDC_MINT: process.env.NEXT_PUBLIC_USDC_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    NEXT_PUBLIC_SOLANA_RPC_URL: process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  },
};

module.exports = nextConfig;
