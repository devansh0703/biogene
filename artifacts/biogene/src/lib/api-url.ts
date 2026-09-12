import { useLocation, useSearch } from "wouter";
import { useCallback } from "react";

/**
 * Read the current URL query string as a record.
 * Uses wouter's `useSearch` (query string only) — `useLocation()` returns
 * the pathname WITHOUT the query in wouter v3, so never parse it manually.
 */
export function useQueryParams(): Record<string, string> {
  const search = useSearch();
  const params: Record<string, string> = {};
  for (const part of search.split("&")) {
    if (!part) continue;
    const [k, v] = part.split("=");
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
  }
  return params;
}

/** Build a navigate target preserving the path with new/updated query params. */
export function withParams(path: string, params: Record<string, string | undefined>): string {
  const [base] = path.split("?");
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) search.set(k, v);
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Update query params on the current page (merges into existing params).
 * Returns a stable callback `(updates) => void`; pass `null` values to remove keys.
 */
export function useSetQueryParams(): (updates: Record<string, string | null>) => void {
  const [location, navigate] = useLocation();
  const params = useQueryParams();
  return useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams();
      const merged = { ...params, ...updates };
      for (const [k, v] of Object.entries(merged)) {
        if (v) next.set(k, v);
      }
      const qs = next.toString();
      const [base] = location.split("?");
      navigate(qs ? `${base}?${qs}` : base, { replace: true });
    },
    [params, location, navigate],
  );
}
