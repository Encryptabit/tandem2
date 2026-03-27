/**
 * JSONL rotating log writer.
 *
 * Appends JSON-stringified records (one per line) to a file. When the file
 * exceeds `maxBytes`, it rotates: `file.jsonl` → `file.jsonl.1`,
 * `file.jsonl.1` → `file.jsonl.2`, etc., deleting files beyond `maxBackups`.
 *
 * All I/O is synchronous — this is designed for low-throughput structured
 * logging of reviewer process output (stdout/stderr lines).
 *
 * Consumed by the stdin-piped spawn capture in T04.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { dirname } from 'node:path';

export interface JsonlLogWriterOptions {
  /** Absolute path to the JSONL log file. */
  filePath: string;
  /** Maximum file size in bytes before rotation (default: 5 MB). */
  maxBytes?: number;
  /** Number of rotated backups to keep (default: 5). */
  maxBackups?: number;
}

export interface JsonlLogWriter {
  /** Append a single JSON record as one line. */
  write(record: Record<string, unknown>): void;
  /** Mark the writer as closed. Subsequent writes are silently ignored. */
  close(): void;
}

const DEFAULT_MAX_BYTES = 5_242_880; // 5 MB
const DEFAULT_MAX_BACKUPS = 5;

/**
 * Create a JSONL rotating log writer.
 *
 * On creation the parent directory is ensured via `mkdirSync` (recursive).
 * If the target file already exists, its current size is read so that
 * rotation triggers correctly even across process restarts.
 */
export function createJsonlLogWriter(options: JsonlLogWriterOptions): JsonlLogWriter {
  const { filePath, maxBytes = DEFAULT_MAX_BYTES, maxBackups = DEFAULT_MAX_BACKUPS } = options;

  // Ensure parent directory exists.
  mkdirSync(dirname(filePath), { recursive: true });

  // Track current file size (resume-aware).
  let currentSize = 0;
  try {
    currentSize = statSync(filePath).size;
  } catch {
    // File doesn't exist yet — start at 0.
  }

  let closed = false;

  function rotate(): void {
    // Shift existing backups up by one: .N → .(N+1)
    for (let i = maxBackups; i >= 1; i--) {
      const src = i === 1 ? filePath : `${filePath}.${i - 1}`;
      const dest = `${filePath}.${i}`;
      if (existsSync(src)) {
        renameSync(src, dest);
      }
    }

    // Delete overflow backup beyond maxBackups.
    const overflow = `${filePath}.${maxBackups + 1}`;
    if (existsSync(overflow)) {
      unlinkSync(overflow);
    }

    currentSize = 0;
  }

  function write(record: Record<string, unknown>): void {
    if (closed) return;

    const line = JSON.stringify(record) + '\n';
    const lineBytes = Buffer.byteLength(line, 'utf8');

    if (currentSize + lineBytes > maxBytes) {
      rotate();
    }

    appendFileSync(filePath, line, 'utf8');
    currentSize += lineBytes;
  }

  function close(): void {
    closed = true;
  }

  return { write, close };
}
