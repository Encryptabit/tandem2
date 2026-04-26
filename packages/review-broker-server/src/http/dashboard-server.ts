import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type { DashboardRouteHandler } from './dashboard-routes.js';
import { BrokerServiceError } from '../runtime/broker-service.js';

export const DEFAULT_DASHBOARD_PORT = 7331;

export interface DashboardServerOptions {
  /** Port to listen on. Defaults to 0 (OS-assigned). */
  port?: number;
  /** Host to bind to. Defaults to '127.0.0.1'. */
  host?: string;
  /** Absolute path to the built Astro dashboard dist directory. */
  dashboardDistPath: string;
  /** Route handler for broker-owned API routes. */
  routes: DashboardRouteHandler;
}

export interface DashboardServer {
  /** The underlying Node HTTP server. */
  server: Server;
  /** The actual port the server is listening on. */
  port: number;
  /** The base URL for the server. */
  baseUrl: string;
  /** Close the server and all SSE connections. */
  close: () => Promise<void>;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

export async function createDashboardServer(options: DashboardServerOptions): Promise<DashboardServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 0;
  const distPath = options.dashboardDistPath;
  const routes = options.routes;

  const sseConnections = new Set<ServerResponse>();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;

    try {
      // Broker-owned API routes
      if (pathname === '/api/overview' && req.method === 'GET') {
        const snapshot = routes.getOverviewSnapshot();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(JSON.stringify(snapshot));
        return;
      }

      if (pathname === '/api/reset' && req.method === 'POST') {
        const result = await routes.resetAll();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(JSON.stringify(result));
        return;
      }

      if (pathname === '/api/pool' && req.method === 'GET') {
        const result = routes.getPoolState();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(JSON.stringify(result));
        return;
      }

      if (pathname === '/api/pool' && req.method === 'POST') {
        const body = await readJsonBody(req);
        if (typeof body.enabled !== 'boolean') {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Expected JSON body with boolean field: enabled' }));
          return;
        }

        const result = await routes.setStandalonePoolEnabled(body.enabled);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(JSON.stringify(result));
        return;
      }

      if (pathname === '/api/events' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        sseConnections.add(res);
        res.on('close', () => {
          sseConnections.delete(res);
        });

        // Send initial heartbeat
        const heartbeat = JSON.stringify({ type: 'heartbeat', serverTime: new Date().toISOString() });
        res.write(`event: heartbeat\ndata: ${heartbeat}\n\n`);
        return;
      }

      if (pathname === '/api/events/clear' && req.method === 'POST') {
        const result = await routes.clearEvents();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(JSON.stringify(result));
        return;
      }

      if (pathname === '/api/events/feed' && req.method === 'GET') {
        const limitParam = url.searchParams.get('limit');
        const beforeParam = url.searchParams.get('before');
        const eventTypeParam = url.searchParams.get('eventType');

        const feedOptions: { limit?: number; beforeId?: number; eventType?: string } = {};
        if (limitParam !== null) {
          const parsed = parseInt(limitParam, 10);
          if (!Number.isNaN(parsed)) feedOptions.limit = parsed;
        }
        if (beforeParam !== null) {
          const parsed = parseInt(beforeParam, 10);
          if (!Number.isNaN(parsed)) feedOptions.beforeId = parsed;
        }
        if (eventTypeParam !== null && eventTypeParam.length > 0) {
          feedOptions.eventType = eventTypeParam;
        }

        const feed = routes.getEventFeed(feedOptions);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(JSON.stringify(feed));
        return;
      }

      // Review list route: GET /api/reviews
      if (pathname === '/api/reviews' && req.method === 'GET') {
        const statusParam = url.searchParams.get('status');
        const limitParam = url.searchParams.get('limit');

        const listOptions: { status?: string; limit?: number } = {};
        if (statusParam !== null && statusParam.length > 0) {
          listOptions.status = statusParam;
        }
        if (limitParam !== null) {
          const parsed = parseInt(limitParam, 10);
          if (!Number.isNaN(parsed)) listOptions.limit = parsed;
        }

        const result = await routes.getReviewList(listOptions);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(JSON.stringify(result));
        return;
      }

      if (pathname === '/api/reviews/clear' && req.method === 'POST') {
        const result = await routes.clearReviews();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(JSON.stringify(result));
        return;
      }

      // Review detail route: GET /api/reviews/:reviewId
      if (pathname.startsWith('/api/reviews/') && req.method === 'GET') {
        const segments = pathname.split('/');
        const reviewId = segments[3];

        if (!reviewId || reviewId.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Missing review ID' }));
          return;
        }

        try {
          const result = await routes.getReviewDetail(reviewId);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
          res.end(JSON.stringify(result));
        } catch (error) {
          if (error instanceof BrokerServiceError && error.code === 'REVIEW_NOT_FOUND') {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Review not found' }));
          } else {
            throw error;
          }
        }
        return;
      }

      // Static asset serving from the built dashboard
      await serveStaticAsset(distPath, pathname, res);
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
  });

  // SSE broadcast function — routes call this to push notifications
  routes.onBroadcast((event: string, data: string) => {
    const message = `event: ${event}\ndata: ${data}\n\n`;
    for (const connection of sseConnections) {
      connection.write(message);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address !== null ? address.port : port;
  const baseUrl = `http://${host}:${actualPort}`;

  return {
    server,
    port: actualPort,
    baseUrl,
    close: async () => {
      // Close all SSE connections first
      for (const connection of sseConnections) {
        connection.end();
      }
      sseConnections.clear();

      // Then close the server
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },
  };
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';

  for await (const chunk of req) {
    raw += chunk.toString('utf8');
    if (raw.length > 64 * 1024) {
      throw new Error('Request body too large.');
    }
  }

  if (raw.trim().length === 0) {
    return {};
  }

  const parsed = JSON.parse(raw) as unknown;
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

async function serveStaticAsset(distPath: string, pathname: string, res: ServerResponse): Promise<void> {
  // Normalize pathname — serve index.html for root
  let filePath: string;
  if (pathname === '/' || pathname === '') {
    filePath = path.join(distPath, 'index.html');
  } else {
    // Prevent path traversal
    const normalized = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    filePath = path.join(distPath, normalized);
  }

  // Verify the resolved path is within distPath
  if (!filePath.startsWith(distPath)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  try {
    const fileStat = await stat(filePath);

    if (fileStat.isDirectory()) {
      // Try index.html in the directory
      filePath = path.join(filePath, 'index.html');
      await stat(filePath); // Will throw if not found
    }

    const content = await readFile(filePath);
    const mimeType = getMimeType(filePath);

    // Content-hashed filenames (e.g. *.abc123.js) are immutable — cache aggressively
    const fileName = path.basename(filePath);
    const isHashed = /\.[a-f0-9]{8,}\.\w+$/.test(fileName);
    const cacheControl = isHashed ? 'public, max-age=31536000, immutable' : 'no-cache';

    res.writeHead(200, { 'Content-Type': mimeType, 'Cache-Control': cacheControl });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
}
