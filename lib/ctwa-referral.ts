/** CTWA / referral fields shared by WhatsApp inbound parsers (Meta Cloud API, etc.). */

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

/** Resolves `ctwa_clid` from message-level or nested `text.referral` (Meta Cloud API). */
export function findCtwaClid(obj: unknown): string | null {
  const fromReferral = asRecord(asRecord(obj)?.referral)?.ctwa_clid;
  if (typeof fromReferral === "string" && fromReferral.length > 0) {
    return fromReferral;
  }
  return findDeepStringProp(obj, "ctwa_clid");
}

export function referralSourceFields(message: unknown): {
  sourceId: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
} {
  const ref = asRecord(asRecord(message)?.referral);
  if (!ref) {
    return { sourceId: null, sourceUrl: null, sourceType: null };
  }
  return {
    sourceId: typeof ref.source_id === "string" ? ref.source_id : null,
    sourceUrl: typeof ref.source_url === "string" ? ref.source_url : null,
    sourceType: typeof ref.source_type === "string" ? ref.source_type : null,
  };
}
