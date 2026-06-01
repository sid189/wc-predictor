/** Build an RFC 4180-style CSV string. Fields are always quoted; embedded
 *  quotes are doubled. Prefix the result with `﻿` (BOM) before sending
 *  so Excel auto-detects UTF-8. */
export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const escape = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [
    headers.map(escape).join(","),
    ...rows.map((r) => r.map(escape).join(",")),
  ].join("\r\n");
}
