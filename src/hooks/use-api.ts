"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

type Query = Record<string, string | number | boolean | null | undefined>;

/** Fetch JSON from the API with loading / error state and a reload() function. */
export function useApi<T>(path: string | null, query?: Query) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const key = path ? path + JSON.stringify(query ?? {}) : null;
  const seq = useRef(0);

  const load = useCallback(
    async (silent = false) => {
      if (!path) return;
      const my = ++seq.current;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const res = await api<T>(path, { query });
        if (my === seq.current) setData(res);
      } catch (e) {
        if (my === seq.current) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (my === seq.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  useEffect(() => {
    load();
  }, [load]);

  return { data, error, loading, reload: () => load(true), setData };
}

/** Run a mutation with pending + error state. */
export function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <R,>(fn: () => Promise<R>): Promise<R | undefined> => {
    setPending(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      return undefined;
    } finally {
      setPending(false);
    }
  }, []);
  return { pending, error, setError, run };
}
