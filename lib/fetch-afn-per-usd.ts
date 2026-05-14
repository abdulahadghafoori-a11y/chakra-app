/**
 * Free providers (no API key). Returns AFN per 1 USD.
 */
export async function fetchAfnPerOneUsdFromPublicApis(): Promise<{
  afnPerOneUsd: number;
  source: "frankfurter" | "exchangerate_host" | "open_er_api";
}> {
  try {
    const res = await fetch(
      "https://api.frankfurter.app/latest?from=USD&to=AFN",
      { cache: "no-store" },
    );
    if (res.ok) {
      const j = (await res.json()) as { rates?: { AFN?: number } };
      const n = j.rates?.AFN;
      if (typeof n === "number" && n > 0) {
        return { afnPerOneUsd: n, source: "frankfurter" };
      }
    }
  } catch {
    /* try next */
  }

  try {
    const res = await fetch(
      "https://api.exchangerate.host/latest?base=USD&symbols=AFN",
      { cache: "no-store" },
    );
    if (res.ok) {
      const j = (await res.json()) as { rates?: { AFN?: number } };
      const n = j.rates?.AFN;
      if (typeof n === "number" && n > 0) {
        return { afnPerOneUsd: n, source: "exchangerate_host" };
      }
    }
  } catch {
    /* try next */
  }

  const res = await fetch("https://open.er-api.com/v6/latest/USD", {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("Could not load USD→AFN from any public FX endpoint.");
  }
  const j = (await res.json()) as { rates?: { AFN?: number } };
  const n = j.rates?.AFN;
  if (typeof n !== "number" || !(n > 0)) {
    throw new Error("AFN rate missing in provider response.");
  }
  return { afnPerOneUsd: n, source: "open_er_api" };
}
