import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const dbPath = process.env.REVIEW_BROKER_DB_PATH;
const host = process.env.REVIEW_BROKER_HOST || '127.0.0.1';
const port = Number(process.env.REVIEW_BROKER_PORT || '0');

if (!dbPath) {
  console.error('Missing REVIEW_BROKER_DB_PATH');
  process.exit(1);
}

const scenarios = new Map();
let reviewCounter = 0;
let server;

function nowIso() {
  return new Date().toISOString();
}

function sqlString(value) {
  if (value === null || value === undefined) {
    return 'null';
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function sqliteExec(sql) {
  try {
    await execFileAsync('sqlite3', [dbPath, sql], { maxBuffer: 1024 * 1024 * 4 });
  } catch (error) {
    const message = error && typeof error === 'object' && 'stderr' in error
      ? String(error.stderr || error.message || error)
      : String(error);
    throw new Error(`sqlite_exec_failed:${message.trim()}`);
  }
}

async function sqliteJson(sql) {
  try {
    const { stdout } = await execFileAsync('sqlite3', ['-json', dbPath, sql], { maxBuffer: 1024 * 1024 * 4 });
    const text = stdout.trim();
    return text ? JSON.parse(text) : [];
  } catch (error) {
    const message = error && typeof error === 'object' && 'stderr' in error
      ? String(error.stderr || error.message || error)
      : String(error);
    throw new Error(`sqlite_json_failed:${message.trim()}`);
  }
}

async function ensureSchema() {
  await sqliteExec(`
    create table if not exists reviews (
      review_id text primary key,
      unit_id text not null,
      status text not null,
      summary text,
      feedback text,
      error_code text,
      error_message text,
      error_retryable integer,
      updated_at text not null,
      status_calls integer not null default 0,
      sequence_json text
    );
  `);
}

function normalizeRecord(reviewId, input, fallback = {}) {
  const status = input?.status ?? fallback.status ?? 'pending';
  const summary = input?.summary ?? fallback.summary ?? 'Broker review queued.';
  const feedback = input?.feedback ?? fallback.feedback ?? null;
  const error = input?.error ?? fallback.error ?? null;
  const updatedAt = input?.updatedAt ?? fallback.updatedAt ?? nowIso();

  return {
    reviewId,
    status,
    summary,
    feedback,
    error: error
      ? {
          code: error.code,
          message: error.message,
          retryable: error.retryable === true,
        }
      : null,
    updatedAt,
  };
}

function toStatusRecord(row) {
  return {
    reviewId: row.reviewId,
    status: row.status,
    summary: row.summary ?? undefined,
    feedback: row.feedback ?? undefined,
    error: row.errorCode
      ? {
          code: row.errorCode,
          message: row.errorMessage ?? row.summary ?? 'Broker review failed.',
          retryable: row.errorRetryable === 1,
        }
      : undefined,
    updatedAt: row.updatedAt,
  };
}

function parseRow(row) {
  return {
    reviewId: row.review_id,
    unitId: row.unit_id,
    status: row.status,
    summary: row.summary,
    feedback: row.feedback,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    errorRetryable: Number(row.error_retryable ?? 0),
    updatedAt: row.updated_at,
    statusCalls: Number(row.status_calls ?? 0),
    sequenceJson: row.sequence_json ?? '[]',
  };
}

async function getReviewRow(reviewId) {
  const rows = await sqliteJson(`
    select review_id, unit_id, status, summary, feedback, error_code, error_message,
           error_retryable, updated_at, status_calls, sequence_json
    from reviews
    where review_id = ${sqlString(reviewId)}
    limit 1;
  `);
  return rows[0] ? parseRow(rows[0]) : null;
}

async function getOpenReviewForUnit(unitId) {
  const rows = await sqliteJson(`
    select review_id, unit_id, status, summary, feedback, error_code, error_message,
           error_retryable, updated_at, status_calls, sequence_json
    from reviews
    where unit_id = ${sqlString(unitId)}
      and status in ('pending', 'waiting', 'blocked')
    order by updated_at desc, review_id desc
    limit 1;
  `);
  return rows[0] ? parseRow(rows[0]) : null;
}

async function listReviewRows() {
  const rows = await sqliteJson(`
    select review_id, unit_id, status, summary, feedback, error_code, error_message,
           error_retryable, updated_at, status_calls, sequence_json
    from reviews
    order by review_id;
  `);
  return rows.map(parseRow);
}

async function upsertReviewRow(row) {
  await sqliteExec(`
    insert into reviews (
      review_id, unit_id, status, summary, feedback,
      error_code, error_message, error_retryable,
      updated_at, status_calls, sequence_json
    ) values (
      ${sqlString(row.reviewId)},
      ${sqlString(row.unitId)},
      ${sqlString(row.status)},
      ${sqlString(row.summary)},
      ${sqlString(row.feedback)},
      ${sqlString(row.error?.code ?? null)},
      ${sqlString(row.error?.message ?? null)},
      ${row.error?.retryable === true ? 1 : 0},
      ${sqlString(row.updatedAt)},
      ${Number(row.statusCalls ?? 0)},
      ${sqlString(row.sequenceJson ?? '[]')}
    )
    on conflict(review_id) do update set
      unit_id = excluded.unit_id,
      status = excluded.status,
      summary = excluded.summary,
      feedback = excluded.feedback,
      error_code = excluded.error_code,
      error_message = excluded.error_message,
      error_retryable = excluded.error_retryable,
      updated_at = excluded.updated_at,
      status_calls = excluded.status_calls,
      sequence_json = excluded.sequence_json;
  `);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return null;
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function sendError(res, statusCode, error) {
  sendJson(res, statusCode, {
    error: {
      code: error?.code ?? 'review_broker_fixture_error',
      message: error?.message ?? 'Review broker fixture failed.',
      retryable: error?.retryable === true,
    },
  });
}

async function handleSubmit(body) {
  const unit = body?.unit;
  if (!unit?.unitId) {
    const error = new Error('unit_id_required');
    error.code = 'unit_id_required';
    throw error;
  }

  const scenario = scenarios.get(unit.unitId) ?? {};
  if (scenario.submitError) {
    throw scenario.submitError;
  }

  if (scenario.reuseOpenReview !== false) {
    const existing = await getOpenReviewForUnit(unit.unitId);
    if (existing) {
      return toStatusRecord(existing);
    }
  }

  const reviewId = `rev-${String(++reviewCounter).padStart(4, '0')}`;
  const initial = normalizeRecord(reviewId, scenario.submit, {
    status: 'pending',
    summary: 'Broker review queued.',
  });
  const row = {
    unitId: unit.unitId,
    ...initial,
    statusCalls: 0,
    sequenceJson: JSON.stringify(Array.isArray(scenario.statusSequence) ? scenario.statusSequence : []),
  };

  await upsertReviewRow(row);
  return toStatusRecord(row);
}

async function handleStatus(reviewId) {
  if (!reviewId) {
    const error = new Error('review_id_required');
    error.code = 'review_id_required';
    throw error;
  }

  const current = await getReviewRow(reviewId);
  if (!current) {
    const error = new Error('review_not_found');
    error.code = 'review_not_found';
    throw error;
  }

  const sequence = JSON.parse(current.sequenceJson || '[]');
  const next = sequence[current.statusCalls] ?? null;
  if (!next) {
    return toStatusRecord(current);
  }

  const updated = normalizeRecord(reviewId, next, current);
  const row = {
    unitId: current.unitId,
    ...updated,
    statusCalls: current.statusCalls + 1,
    sequenceJson: current.sequenceJson || '[]',
  };

  await upsertReviewRow(row);
  return toStatusRecord(row);
}

async function requestListener(req, res) {
  try {
    const url = new URL(req.url || '/', `http://${host}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true, pid: process.pid, dbPath });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/submit') {
      const body = await readJsonBody(req);
      sendJson(res, 200, await handleSubmit(body));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/status') {
      sendJson(res, 200, await handleStatus(url.searchParams.get('reviewId')));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/admin/scenario') {
      const body = await readJsonBody(req);
      if (!body?.unitId) {
        const error = new Error('unit_id_required');
        error.code = 'unit_id_required';
        throw error;
      }
      scenarios.set(body.unitId, body.scenario ?? {});
      sendJson(res, 200, { ok: true, unitId: body.unitId });
      return;
    }

    if (req.method === 'DELETE' && url.pathname === '/admin/scenario') {
      const unitId = url.searchParams.get('unitId');
      if (unitId) {
        scenarios.delete(unitId);
      }
      sendJson(res, 200, { ok: true, unitId });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/admin/reviews') {
      sendJson(res, 200, { reviews: await listReviewRows() });
      return;
    }

    sendJson(res, 404, { error: { code: 'not_found', message: 'Route not found.' } });
  } catch (error) {
    sendError(res, error?.code === 'not_found' ? 404 : 400, error);
  }
}

function installSignalHandlers() {
  let closing = false;
  async function shutdown(signal) {
    if (closing) {
      return;
    }
    closing = true;
    try {
      await new Promise((resolve) => server.close(resolve));
    } finally {
      process.exit(signal === 'SIGTERM' || signal === 'SIGINT' ? 0 : 1);
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

await ensureSchema();
server = createServer((req, res) => {
  void requestListener(req, res);
});
installSignalHandlers();

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, host, () => {
    server.off('error', reject);
    resolve();
  });
});

const address = server.address();
const actualPort = typeof address === 'object' && address ? address.port : port;
console.log(`READY ${JSON.stringify({ pid: process.pid, dbPath, baseUrl: `http://${host}:${actualPort}` })}`);
