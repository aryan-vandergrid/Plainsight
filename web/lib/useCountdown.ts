"use client";

import { useEffect, useState } from "react";
import { BLOCK_SECONDS } from "./auction";

export function useCountdown(blocksLeft: number | undefined): number | undefined {
  const [target, setTarget] = useState<number>();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (blocksLeft !== undefined) setTarget(Date.now() + Math.max(0, blocksLeft) * BLOCK_SECONDS * 1000);
  }, [blocksLeft]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return target === undefined ? undefined : Math.max(0, Math.round((target - now) / 1000));
}
