#!/usr/bin/env bash
set -euo pipefail
LABEL=${1:?usage: full.sh <label>}
cd "$(dirname "$0")/../.."
source .env
export DEPLOYER_PK=0x${DEPLOYER_PK#0x} ISSUER_PK=0x${ISSUER_PK#0x}
RPC=${RPC:-$SEPOLIA_RPC_URL}
F=(--rpc-url "$RPC" --hardfork amsterdam --broadcast --slow --gas-estimate-multiplier 200)
ANVIL=$(cast rpc anvil_nodeInfo --rpc-url "$RPC" >/dev/null 2>&1 && echo 1 || echo 0)
LAUNCHER=$(jq -r .launcher addresses.json)
FLAGS=$(jq -r .flagRegistry addresses.json)
AUCTION_BLOCKS=${AUCTION_BLOCKS:-$([ "$ANVIL" = 1 ] && echo 150 || echo 50)}
LOG=$(mktemp)

say() { printf '\n=== %s\n' "$*"; }
run() {
  if ! forge script "$@" "${F[@]}" >"$LOG" 2>&1; then
    tail -8 "$LOG"
    echo "FAILED: forge script $*" >&2
    exit 1
  fi
  sed -n '/== Logs ==/,/^$/p' "$LOG" | sed '/== Logs ==/d; /^$/d' # some scripts log nothing: not an error
}
call() { cast call "$@" --rpc-url "$RPC" | awk '{print $1}'; }
auction() { cast call "$LAUNCHER" "auctionInfo(bytes32)(address)" "$(cast keccak "$1")" --rpc-url "$RPC" | head -1; }
block() { cast block-number --rpc-url "$RPC"; }
wait_block() {
  while now=$(block) && [ "$now" -lt "$1" ]; do
    if [ "$ANVIL" = 1 ]; then cast rpc anvil_mine "$(cast to-hex $(( $1 - now < 10 ? $1 - now : 10 )))" --rpc-url "$RPC" >/dev/null || sleep 2
    else sleep 20; fi
  done
}
wait_secs() {
  if [ "$ANVIL" = 1 ]; then cast rpc evm_increaseTime "$1" --rpc-url "$RPC" >/dev/null; cast rpc anvil_mine 0x1 --rpc-url "$RPC" >/dev/null
  else sleep "$1"; fi
}
started=$(date +%s)

say "1. No manifest, no launch; post $LABEL (30-minute window) and verify; xyz stays blocked"
run script/demo/PostManifest.s.sol --sig "revertCase()"
run script/demo/PostManifest.s.sol --sig "postWindow(string,uint32)" "$LABEL" 1800
[ "$(call "$(jq -r .manifestRegistry addresses.json)" "status(bytes32)(uint8)" "$(cast keccak xyz)")" != 0 ] || run script/demo/PostManifest.s.sol --sig "mismatch()"

say "2. Auction: $AUCTION_BLOCKS blocks, 30 bidders; then collect, split 100/15 and open the pool"
run script/demo/Launch.s.sol --sig "run(string,uint32)" "$LABEL" "$AUCTION_BLOCKS"
A=$(auction "$LABEL")
wait_block "$(call "$A" "startBlock()(uint64)")"
run script/demo/Bidders.s.sol --sig "run(string)" "$LABEL"
wait_block "$(call "$A" "endBlock()(uint64)")"
run script/demo/Bidders.s.sol --sig "settle(string)" "$LABEL"
opened=$(date +%s)

say "3. The same token, launched plainly; LP in both pools"
run script/demo/PlainLaunch.s.sol --sig "run(string)" "$LABEL"
run script/demo/Dump.s.sol --sig "seed(string,uint256)" "$LABEL" 150000

say "4. Airdrop dump: 70,000 tokens into both pools"
run script/demo/Dump.s.sol --sig "dump(string,uint256)" "$LABEL" 70000

say "5. Wash bot (20 round trips of \$375k), then a team wallet sells"
run script/demo/WashBot.s.sol --sig "wash(string,uint256,uint256,uint256)" "$LABEL" 20 375000 10
run script/demo/InsiderSell.s.sol --sig "run(string)" "$LABEL"

say "6. The agent halts trading"
run script/demo/Pause.s.sol --sig "run(string)" "$LABEL"

say "7. FlowTrack patterns; the signer posts the flag; the flagged wallet sells again"
run script/demo/FlowTrackDemo.s.sol --sig "run(string)" "$LABEL"
FRESH=$(cast wallet address --private-key "$(cast keccak "plainsight-demo/$LABEL/fresh-wallet")")
cast send "$FLAGS" "flag(bytes32,address,bytes32)" "$(cast keccak "$LABEL")" "$FRESH" "$(cast keccak funded-fresh-wallet)" \
  --private-key "$DEPLOYER_PK" --rpc-url "$RPC" >/dev/null && echo "  flagged $FRESH (funded-fresh-wallet)"
run script/demo/FlowTrackDemo.s.sol --sig "sellAgain(string)" "$LABEL"

say "8. The support window ends: settle"
left=$((1800 + 30 - ($(date +%s) - opened)))
[ "$ANVIL" = 1 ] && left=1830
[ "$left" -gt 0 ] && { echo "  waiting ${left}s"; wait_secs "$left"; }
run script/demo/Settle.s.sol --sig "run(string)" "$LABEL"

say "9. Feed"
if curl -sf "http://localhost:${PORT:-3000}/api/feed/$LABEL" -o "$LOG"; then
  jq -c '{score: .score.total, clearing: .auction.clearingPriceUsd, real: .volume.real.usd, fake: .volume.fake.usd, insiderSells: .volume.insiderSells, flags: (.flags | length), settled: .vault.settled}' "$LOG"
else
  echo "  (web app not running on port ${PORT:-3000}: skipped)"
fi
say "Demo for $LABEL ran clean in $(( ($(date +%s) - started) / 60 )) min"
