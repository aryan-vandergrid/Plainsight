import {
  bytesToHex,
  consensusIdenticalAggregation,
  CronCapability,
  EVMClient,
  encodeCallMsg,
  getNetwork,
  handler,
  hexToBase64,
  HTTPClient,
  type HTTPSendRequester,
  LATEST_BLOCK_NUMBER,
  ok,
  prepareReportRequest,
  Runner,
  type Runtime,
  text,
  TxStatus,
} from "@chainlink/cre-sdk";
import {
  type Abi,
  type Address,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  keccak256,
  toBytes,
  toHex,
  zeroAddress,
} from "viem";
import { z } from "zod";
import { FLAGS_ABI, HOOK_ABI, POOL_KEY, VAULT_ABI } from "./abi";

const configSchema = z.object({
  schedule: z.string(),
  label: z.string(),
  flowTrackUrl: z.string(),
  chainSelectorName: z.string(),
  flagRegistry: z.string(),
  hook: z.string(),
  vault: z.string(),
  gasLimit: z.string(),
  reportGasLimit: z.string(),
  reportDays: z.array(z.number()),
  alwaysReport: z.boolean(),
});
type Config = z.infer<typeof configSchema>;

type Finding = { wallet: string; reason: string; evidence: string };

const KIND_FLAG = 1;
const KIND_REPORT = 3;

function evm(runtime: Runtime<Config>): EVMClient {
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: runtime.config.chainSelectorName, isTestnet: true });
  if (!network) throw new Error(`Unknown chain ${runtime.config.chainSelectorName}`);
  return new EVMClient(network.chainSelector.selector);
}

function read<T>(runtime: Runtime<Config>, client: EVMClient, to: string, abi: Abi, functionName: string, args: readonly unknown[]): T {
  const data = encodeFunctionData({ abi, functionName, args } as Parameters<typeof encodeFunctionData>[0]);
  const reply = client
    .callContract(runtime, { call: encodeCallMsg({ from: zeroAddress, to: to as Address, data }), blockNumber: LATEST_BLOCK_NUMBER })
    .result();
  return decodeFunctionResult({ abi, functionName, data: bytesToHex(reply.data) } as Parameters<typeof decodeFunctionResult>[0]) as T;
}

function deliver(runtime: Runtime<Config>, client: EVMClient, kind: number, payload: Hex, gasLimit: string): string {
  const body = encodeAbiParameters([{ type: "uint8" }, { type: "bytes" }], [kind, payload]);
  const report = runtime.report(prepareReportRequest(body)).result();
  const reply = client
    .writeReport(runtime, { receiver: runtime.config.flagRegistry, report, gasConfig: { gasLimit } })
    .result();
  const txHash = bytesToHex(reply.txHash || new Uint8Array(32));
  runtime.log(`writeReport kind=${kind} txHash=${txHash} txStatus=${reply.txStatus} receiver=${reply.receiverContractExecutionStatus}`);
  if (reply.txStatus !== TxStatus.SUCCESS) throw new Error(`report write failed: ${reply.errorMessage || reply.txStatus}`);
  return txHash;
}

const tokenId = (label: string) => keccak256(toBytes(label));

const fetchFindings = (requester: HTTPSendRequester, config: Config): string => {
  const res = requester.sendRequest({ url: config.flowTrackUrl, method: "GET" }).result();
  if (!ok(res)) throw new Error(`FlowTrack returned ${res.statusCode}`);
  return text(res);
};

const onFlags = (runtime: Runtime<Config>) => {
  const raw = new HTTPClient().sendRequest(runtime, fetchFindings, consensusIdenticalAggregation<string>())(runtime.config).result();
  const findings = (JSON.parse(raw) as { flags: Finding[] }).flags ?? [];
  runtime.log(`FlowTrack: ${findings.length} finding(s) for ${runtime.config.label}`);

  const client = evm(runtime);
  const id = tokenId(runtime.config.label);
  const fresh = findings.filter((f) => !read<boolean>(runtime, client, runtime.config.flagRegistry, FLAGS_ABI, "isFlagged", [id, f.wallet]));
  if (fresh.length === 0) {
    runtime.log("No new flags to post.");
    return "no new flags";
  }
  for (const f of fresh) runtime.log(`flag ${f.wallet}: ${f.reason} (${f.evidence})`);
  const payload = encodeAbiParameters(
    [{ type: "bytes32" }, { type: "address[]" }, { type: "bytes32[]" }],
    [id, fresh.map((f) => f.wallet as Address), fresh.map((f) => keccak256(toBytes(f.reason)))],
  );
  const tx = deliver(runtime, client, KIND_FLAG, payload, runtime.config.gasLimit);
  if (!read<boolean>(runtime, client, runtime.config.flagRegistry, FLAGS_ABI, "isFlagged", [id, fresh[0].wallet])) {
    throw new Error(`forwarder tx ${tx} mined but FlagRegistry didn't store the flags (out of gas? raise gasLimit)`);
  }
  return tx;
};

const onReport = (runtime: Runtime<Config>) => {
  const cfg = runtime.config;
  const client = evm(runtime);
  const id = tokenId(cfg.label);

  const key = read<{ currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address }>(runtime, client, cfg.vault, VAULT_ABI, "poolKey", [id]);
  const poolId = keccak256(encodeAbiParameters(POOL_KEY, [key]));
  const day = Number(read<bigint>(runtime, client, cfg.hook, HOOK_ABI, "currentDay", [poolId]));
  const done = read<{ day: number }[]>(runtime, client, cfg.flagRegistry, FLAGS_ABI, "reportsOf", [id]).map((r) => Number(r.day));
  const due = cfg.reportDays.filter((d) => d <= day && !done.includes(d));
  const reportDay = due.length > 0 ? due[due.length - 1] : cfg.alwaysReport ? day : -1;
  if (reportDay < 0) {
    runtime.log(`Day ${day}: no report due (published: ${done.join(", ") || "none"}).`);
    return "no report due";
  }

  const vault = read<{ usdcInWall: bigint; usdcUnplaced: bigint; tokensBought: bigint }>(runtime, client, cfg.vault, VAULT_ABI, "status", [id]);
  const stats = read<{ realVolume: bigint; fakeVolume: bigint; roundTrips: bigint; penaltyUsdc: bigint; insiderSells: bigint }>(runtime, client, cfg.hook, HOOK_ABI, "stats", [poolId]);
  const paused = read<boolean>(runtime, client, cfg.hook, HOOK_ABI, "paused", [poolId]);

  const json = JSON.stringify({
    v: 1,
    ens: `${cfg.label}.plainsight.eth`,
    day: reportDay,
    poolId,
    vault: { usdcInWall: vault.usdcInWall.toString(), usdcUnplaced: vault.usdcUnplaced.toString(), tokensBought: vault.tokensBought.toString() },
    volume: { real: stats.realVolume.toString(), fake: stats.fakeVolume.toString(), roundTrips: stats.roundTrips.toString(), penaltyUsdc: stats.penaltyUsdc.toString() },
    insiderSells: stats.insiderSells.toString(),
    paused,
  });
  const hash = keccak256(toBytes(json));
  const uri = `data:application/json;base64,${hexToBase64(toHex(json))}`;
  runtime.log(`Day ${reportDay} report ${hash}: ${json}`);

  const payload = encodeAbiParameters([{ type: "bytes32" }, { type: "uint16" }, { type: "bytes32" }, { type: "string" }], [id, reportDay, hash, uri]);
  const tx = deliver(runtime, client, KIND_REPORT, payload, cfg.reportGasLimit);
  const stored = read<{ day: number; hash: Hex }[]>(runtime, client, cfg.flagRegistry, FLAGS_ABI, "reportsOf", [id]);
  if (!stored.some((r) => r.hash === hash)) {
    throw new Error(`forwarder tx ${tx} mined but FlagRegistry didn't store the report (out of gas? raise reportGasLimit)`);
  }
  return tx;
};

const initWorkflow = (config: Config) => {
  const cron = new CronCapability();
  return [handler(cron.trigger({ schedule: config.schedule }), onFlags), handler(cron.trigger({ schedule: config.schedule }), onReport)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}
