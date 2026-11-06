import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "../../contracts/out");
const dest = join(here, "../lib/abis");

const contracts = [
  ["ManifestRegistry.sol", "ManifestRegistry"],
  ["Launcher.sol", "Launcher"],
  ["MockToken.sol", "MockToken"],
  ["LaunchToken.sol", "LaunchToken"],
  ["AuctionDeployer.sol", "AuctionDeployer"],
  ["GreenshoeVault.sol", "GreenshoeVault"],
  ["TestUSDC.sol", "TestUSDC"],
  ["ContinuousClearingAuction.sol", "ContinuousClearingAuction"],
  ["CCALens.sol", "CCALens"],
  ["Permit2.sol", "Permit2"],
  ["PlainsightHook.sol", "PlainsightHook"],
  ["StateView.sol", "StateView"],
  ["V4Quoter.sol", "V4Quoter"],
];
const deployable = new Set(["LaunchToken"]);
const asView = { CCALens: new Set(["state"]), V4Quoter: new Set(["quoteExactInputSingle"]) };

for (const [file, name] of contracts) {
  const { abi: raw, bytecode } = JSON.parse(readFileSync(join(out, file, `${name}.json`), "utf8"));
  const abi = raw.map((x) => (asView[name]?.has(x.name) ? { ...x, stateMutability: "view" } : x));
  const id = `${name[0].toLowerCase()}${name.slice(1)}`;
  let ts = `export const ${id}Abi = ${JSON.stringify(abi, null, 2)} as const;\n`;
  if (deployable.has(name)) ts += `\nexport const ${id}Bytecode = "${bytecode.object}" as const;\n`;
  writeFileSync(join(dest, `${name}.ts`), ts);
  console.log(`wrote lib/abis/${name}.ts`);
}
