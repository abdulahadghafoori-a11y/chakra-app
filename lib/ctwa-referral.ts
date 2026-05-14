/**
 * CTWA / referral fields shared by WhatsApp inbound parsers (Meta Cloud API, etc.).
 *
 * **Click id (`ctwa_clid`)**: Meta sends an opaque string (often base64url-style:
 * letters, digits, `-`, `_`; sometimes `+` or `/` depending on encode). It is not a UUID.
 * We persist it in Postgres `text` (UTF-8) and match on the exact stored value; ingest uses
 * `.trim()` only so leading/trailing whitespace from relays does not break lookups. Do not strip
 * or re-encode interior characters—doing so would desync from Meta’s attribution keys.
 */

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function findDeepStringProp(root: unknown, prop: string): string | null {
  const seen = new Set<unknown>();

  function walk(node: unknown): string | null {
    if (node === null || node === undefined) return null;
    if (typeof node !== "object") return null;
    if (seen.has(node)) return null;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item);
        if (found) return found;
      }
      return null;
    }

    const o = node as Record<string, unknown>;
    if (typeof o[prop] === "string" && (o[prop] as string).length > 0) {
      return o[prop] as string;
    }
    for (const v of Object.values(o)) {
      const found = walk(v);
      if (found) return found;
    }
    return null;
  }

  return walk(root);
}

function firstTrimmedNonEmpty(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string") {
      const t = v.trim();
      if (t.length > 0) return t;
    }
  }
  return null;
}

/**
 * Meta Cloud API snake_case (`ctwa_clid`) and relays that camelCase (`ctwaClid`).
 * Checks top-level referral, nested `text.referral`, then deep search for either key name.
 * Returned value is trimmed; inner characters are preserved.
 */
export function findCtwaClid(obj: unknown): string | null {
  const msg = asRecord(obj);
  for (const ref of [
    asRecord(msg?.referral),
    asRecord(asRecord(msg?.text)?.referral),
  ]) {
    if (!ref) continue;
    const clid = firstTrimmedNonEmpty(ref.ctwa_clid, ref.ctwaClid);
    if (clid) return clid;
  }
  return (
    findDeepStringProp(obj, "ctwa_clid") ?? findDeepStringProp(obj, "ctwaClid")
  );
}

export function referralSourceFields(message: unknown): {
  sourceId: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
} {
  let ref = asRecord(asRecord(message)?.referral);
  if (!ref) {
    ref = asRecord(asRecord(asRecord(message)?.text)?.referral);
  }
  if (!ref) {
    return { sourceId: null, sourceUrl: null, sourceType: null };
  }
  return {
    sourceId: firstTrimmedNonEmpty(ref.source_id, ref.sourceId),
    sourceUrl: firstTrimmedNonEmpty(ref.source_url, ref.sourceUrl),
    sourceType: firstTrimmedNonEmpty(ref.source_type, ref.sourceType),
  };
}
