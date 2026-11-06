import { concatHex, encodeAbiParameters, parseAbi, toHex, type Address, type Hex } from "viem";
import type { PoolKeyT } from "./pool";

export const universalRouterAbi = parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"]);

const V4_SWAP = 0x10;
const SWAP_EXACT_IN_SINGLE = 0x06;
const SETTLE_ALL = 0x0c;
const TAKE_ALL = 0x0f;

const poolKeyComponents = [
  { name: "currency0", type: "address" },
  { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "hooks", type: "address" },
] as const;

const exactInputSingle = [
  {
    type: "tuple",
    components: [
      { name: "poolKey", type: "tuple", components: poolKeyComponents },
      { name: "zeroForOne", type: "bool" },
      { name: "amountIn", type: "uint128" },
      { name: "amountOutMinimum", type: "uint128" },
      { name: "hookData", type: "bytes" },
    ],
  },
] as const;

const currencyAmount = [{ type: "address" }, { type: "uint256" }] as const;

export function encodeExactInSingle(key: PoolKeyT, zeroForOne: boolean, amountIn: bigint, minOut: bigint): { commands: Hex; inputs: Hex[] } {
  const [cin, cout] = zeroForOne ? [key.currency0, key.currency1] : [key.currency1, key.currency0];
  const actions = concatHex([toHex(SWAP_EXACT_IN_SINGLE, { size: 1 }), toHex(SETTLE_ALL, { size: 1 }), toHex(TAKE_ALL, { size: 1 })]);
  const params = [
    encodeAbiParameters(exactInputSingle, [{ poolKey: key, zeroForOne, amountIn, amountOutMinimum: minOut, hookData: "0x" }]),
    encodeAbiParameters(currencyAmount, [cin as Address, amountIn]),
    encodeAbiParameters(currencyAmount, [cout as Address, minOut]),
  ];
  const input = encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], [actions, params]);
  return { commands: toHex(V4_SWAP, { size: 1 }), inputs: [input] };
}

export const REASON_CODES = [
  { code: "VOLATILITY", text: "Abnormal volatility" },
  { code: "MANIPULATION", text: "Suspected manipulation" },
  { code: "ORACLE", text: "Price or data incident" },
  { code: "SECURITY", text: "Security incident" },
  { code: "DISCLOSURE", text: "Pending disclosure" },
] as const;

export const bytes32ToText = (b: Hex) => {
  const hex = b.slice(2).replace(/(00)+$/, "");
  let s = "";
  for (let i = 0; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return s;
};
