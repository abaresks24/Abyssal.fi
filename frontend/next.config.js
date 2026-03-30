/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  eslint:     { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors:  true },

  // Force Next.js to transpile Privy packages through its bundler.
  // This avoids ESM/CJS conflicts from their nested dependencies.
  transpilePackages: [
    '@privy-io/react-auth',
    '@privy-io/js-sdk-core',
    '@privy-io/are-addresses-equal',
  ],

  webpack: (config) => {
    // ── Solana / Anchor node polyfills ──────────────────────────────────────
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

    // ── Deduplicate viem ────────────────────────────────────────────────────
    // Privy v3 + WalletConnect bring 14 nested viem installs, all with
    // incomplete ESM builds on Windows/WSL filesystems.
    // Aliasing 'viem' to the root install (2.47.6) fixes all of them at once.
    config.resolve.alias = {
      ...config.resolve.alias,
      viem: path.resolve(__dirname, 'node_modules/viem'),
    };

    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    return config;
  },

  env: {
    NEXT_PUBLIC_PACIFICA_API_URL:  process.env.NEXT_PUBLIC_PACIFICA_API_URL  || 'https://api.pacifica.finance',
    NEXT_PUBLIC_PACIFICA_WS_URL:   process.env.NEXT_PUBLIC_PACIFICA_WS_URL   || 'wss://ws.pacifica.finance',
    NEXT_PUBLIC_PROGRAM_ID:        process.env.NEXT_PUBLIC_PROGRAM_ID        || 'CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG',
    NEXT_PUBLIC_USDC_MINT:         process.env.NEXT_PUBLIC_USDC_MINT         || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    NEXT_PUBLIC_SOLANA_RPC_URL:    process.env.NEXT_PUBLIC_SOLANA_RPC_URL    || 'https://api.devnet.solana.com',
  },
};

module.exports = nextConfig;
