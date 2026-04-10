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

    // ── Deduplicate viem + stub missing Privy peer deps ─────────────────────
    // Privy v3 + WalletConnect bring 14 nested viem installs, all with
    // incomplete ESM builds on Windows/WSL filesystems.
    // Aliasing 'viem' to the root install (2.47.6) fixes all of them at once.
    // @farcaster/mini-app-solana and @solana-program/memo are optional peer
    // deps pulled in by Privy internals that are not published to npm yet —
    // stub them with an empty module so the build doesn't fail.
    const emptyModule = path.resolve(__dirname, 'stubs/empty-module.js');
    config.resolve.alias = {
      ...config.resolve.alias,
      viem: path.resolve(__dirname, 'node_modules/viem'),
      '@farcaster/mini-app-solana': emptyModule,
      '@solana-program/memo':       emptyModule,
      '@solana/kit':                emptyModule,
      '@solana-program/token':      emptyModule,
      '@solana-program/system':     emptyModule,
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
    // Public keys — safe to hardcode (NEXT_PUBLIC_ = browser-visible by design)
    NEXT_PUBLIC_PRIVY_APP_ID:               process.env.NEXT_PUBLIC_PRIVY_APP_ID               || 'cmndd9hnc008p0bkybu6ys37h',
    NEXT_PUBLIC_VAULT_AUTHORITY:            process.env.NEXT_PUBLIC_VAULT_AUTHORITY            || 'AHWUeGsXbx9gd46SBS5SQK4rfQ8rGb1wWAzvZtJ6zdRg',
    NEXT_PUBLIC_PACIFICA_FAUCET_PROGRAM_ID: process.env.NEXT_PUBLIC_PACIFICA_FAUCET_PROGRAM_ID || 'peRPsYCcB1J9jvrs29jiGdjkytxs8uHLmSPLKKP9ptm',
  },
};

module.exports = nextConfig;
