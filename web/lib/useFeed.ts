"use client";

import { useQuery } from "@tanstack/react-query";
import type { Feed } from "./server/feed";

export function useFeed(label: string, enabled = true) {
  return useQuery({
    queryKey: ["feed", label],
    queryFn: async (): Promise<Feed> => {
      const r = await fetch(`/api/feed/${label}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled,
    refetchInterval: 30_000,
  });
}
