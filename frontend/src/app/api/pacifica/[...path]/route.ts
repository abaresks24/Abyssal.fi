/**
 * Server-side proxy for Pacifica API.
 * Injects the API key header so it never reaches the browser bundle.
 *
 * Usage: GET /api/pacifica/v1/markets/BTC-PERP/ticker
 *   → proxied to https://api.pacifica.finance/v1/markets/BTC-PERP/ticker
 *     with Authorization: Bearer <PACIFICA_API_KEY>
 */
import { NextRequest, NextResponse } from 'next/server';

const PACIFICA_BASE = process.env.PACIFICA_API_BASE_URL ?? 'https://api.pacifica.fi/api';
const PACIFICA_KEY = process.env.PACIFICA_API_KEY ?? '';

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const pathStr = params.path.join('/');
  const search = req.nextUrl.search ?? '';
  const upstreamUrl = `${PACIFICA_BASE}/${pathStr}${search}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        ...(PACIFICA_KEY ? { 'x-api-key': PACIFICA_KEY } : {}),
        'Content-Type': 'application/json',
        'User-Agent': 'PacificaOptions-Frontend/0.1.0',
      },
      // Don't cache funding rate or price data
      cache: 'no-store',
    });

    const body = await upstream.text();

    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
        // Allow frontend to read the response
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('[Pacifica proxy] Error:', err);
    return NextResponse.json(
      { error: 'Failed to reach Pacifica API' },
      { status: 502 }
    );
  }
}
