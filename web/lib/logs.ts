import type { AbiEvent, Address, Log, PublicClient } from "viem";

const LOG_CHUNK = 499n;

let rangeCapped = false;

export async function getLogsChunkedRaw(pc: PublicClient, address: Address, event: AbiEvent, fromBlock: bigint, toBlock: bigint, args?: Record<string, unknown>): Promise<Log[]> {
  if (fromBlock > toBlock) return [];
  if (!rangeCapped && toBlock - fromBlock > LOG_CHUNK) {
    try {
      return (await pc.getLogs({ address, event, fromBlock, toBlock, args } as Parameters<PublicClient["getLogs"]>[0])) as Log[];
    } catch {
      rangeCapped = true;
    }
  }
  const ranges: [bigint, bigint][] = [];
  for (let a = fromBlock; a <= toBlock; a += LOG_CHUNK + 1n) ranges.push([a, a + LOG_CHUNK > toBlock ? toBlock : a + LOG_CHUNK]);
  const out: Log[] = [];
  for (let i = 0; i < ranges.length; i += 4) {
    const batch = await Promise.all(ranges.slice(i, i + 4).map(([f, t]) => pc.getLogs({ address, event, fromBlock: f, toBlock: t, args } as Parameters<PublicClient["getLogs"]>[0])));
    out.push(...(batch.flat() as Log[]));
  }
  return out;
}
