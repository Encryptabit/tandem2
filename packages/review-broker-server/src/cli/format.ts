/**
 * Output formatting helpers for the `tandem` CLI.
 *
 * All formatters return strings — the caller writes to stdout.
 * This keeps formatting pure and testable.
 */

/**
 * Format any value as pretty-printed JSON.
 */
export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Format tabular data with padded columns.
 *
 * @param headers - Column header labels
 * @param rows - 2D array of cell values (strings)
 * @returns Formatted table string with header, separator, and data rows
 */
export function formatTable(headers: string[], rows: string[][]): string {
  // Compute max width for each column across headers and all rows
  const columnWidths = headers.map((header, columnIndex) => {
    const cellWidths = rows.map((row) => (row[columnIndex] ?? '').length);
    return Math.max(header.length, ...cellWidths);
  });

  const headerLine = headers.map((header, index) => header.padEnd(columnWidths[index]!)).join('  ');
  const separatorLine = columnWidths.map((width) => '─'.repeat(width)).join('  ');
  const dataLines = rows.map((row) =>
    headers.map((_, index) => (row[index] ?? '').padEnd(columnWidths[index]!)).join('  '),
  );

  return [headerLine, separatorLine, ...dataLines].join('\n');
}

/**
 * Format key-value detail entries with aligned labels.
 *
 * Example output:
 *   Review Count:   42
 *   Reviewer Count: 3
 *
 * @param entries - Array of [label, value] pairs
 * @returns Formatted detail string with aligned colons
 */
export function formatDetail(entries: Array<[string, string | number | null]>): string {
  const maxLabelLength = Math.max(...entries.map(([label]) => label.length));

  return entries
    .map(([label, value]) => {
      const paddedLabel = `${label}:`.padEnd(maxLabelLength + 2);
      const displayValue = value === null || value === undefined ? '—' : String(value);
      return `${paddedLabel} ${displayValue}`;
    })
    .join('\n');
}

/**
 * Format a record of status → count pairs as a compact summary line.
 *
 * Example output: "pending: 3, claimed: 1, completed: 2"
 *
 * @param counts - Partial record of status names to counts
 * @returns Compact single-line status summary, or "none" if empty
 */
export function formatStatusCounts(counts: Partial<Record<string, number>>): string {
  const entries = Object.entries(counts).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0);

  if (entries.length === 0) {
    return 'none';
  }

  return entries.map(([status, count]) => `${status}: ${count}`).join(', ');
}
