#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
source .env
export DEPLOYER_PK=0x${DEPLOYER_PK#0x} ISSUER_PK=0x${ISSUER_PK#0x}
RPC=${RPC:-$SEPOLIA_RPC_URL}
F=(--rpc-url "$RPC" --hardfork amsterdam --broadcast --slow --gas-estimate-multiplier 200)
ANVIL=$(cast rpc anvil_nodeInfo --rpc-url "$RPC" >/dev/null 2>&1 && echo 1 || echo 0)
REG=$(jq -r .manifestRegistry addresses.json)
LAUNCHER=$(jq -r .launcher addresses.json)
SHORT=${SHORT:-$([ "$ANVIL" = 1 ] && echo 150 || echo 50)}
SETTLED=${SETTLED:-orbit}
BIDS=(--rpc-url "$RPC" --hardfork amsterdam --broadcast --gas-estimate-multiplier 250)

say() { printf '\n=== %s\n' "$*"; }
run() { forge script "$@" "${F[@]}" 2>&1 | grep -E "$GREP|Error|error:|revert" || true; }
bid() { forge script "$@" "${BIDS[@]}" 2>&1 | grep -E "Bids placed|committed|Error|error:|revert" || true; }
GREP='erif|checks|Auction live|ends at|Exited|Graduated|graduate|refund|Settled|burn|returned|DEMO|reverted'
posted() { [ "$(cast call "$REG" "status(bytes32)(uint8)" "$(cast keccak "$1")" --rpc-url "$RPC")" != "0" ]; }
launched() { [ "$(cast call "$LAUNCHER" "auctionInfo(bytes32)(address)" "$(cast keccak "$1")" --rpc-url "$RPC" 2>/dev/null | head -1)" != "0x0000000000000000000000000000000000000000" ]; }
end_block() { cast call "$(cast call "$LAUNCHER" "auctionInfo(bytes32)(address)" "$(cast keccak "$1")" --rpc-url "$RPC" | head -1)" "endBlock()(uint64)" --rpc-url "$RPC" | awk '{print $1}'; }
start_block() { cast call "$(cast call "$LAUNCHER" "auctionInfo(bytes32)(address)" "$(cast keccak "$1")" --rpc-url "$RPC" | head -1)" "startBlock()(uint64)" --rpc-url "$RPC" | awk '{print $1}'; }
block() { cast block-number --rpc-url "$RPC"; }

wait_block() { # wait_block <n>
  local n=$1
  if [ "$ANVIL" = 1 ]; then
    local now
    while now=$(block) && [ "$now" -lt "$n" ]; do # in chunks: one big anvil_mine on a fork can time out
      cast rpc anvil_mine "$(cast to-hex $(( n - now < 10 ? n - now : 10 )))" --rpc-url "$RPC" >/dev/null || sleep 2
    done
  else
    while [ "$(block)" -lt "$n" ]; do sleep 20; done
  fi
}
wait_secs() { # wait_secs <seconds>
  if [ "$ANVIL" = 1 ]; then
    cast rpc evm_increaseTime "$1" --rpc-url "$RPC" >/dev/null && cast rpc anvil_mine 0x1 --rpc-url "$RPC" >/dev/null
  else
    sleep "$1"
  fi
}

say "blocked: xyz"
posted xyz || run script/demo/PostManifest.s.sol --sig "mismatch()"

say "upcoming: lumen"
posted lumen || run script/demo/PostManifest.s.sol --sig "post(string)" lumen

say "settled (part 1): $SETTLED, 30-minute window, $SHORT-block auction, 30 bidders"
if ! launched "$SETTLED"; then
  posted "$SETTLED" || run script/demo/PostManifest.s.sol --sig "postWindow(string,uint32)" "$SETTLED" 1800
  run script/demo/Launch.s.sol --sig "run(string,uint32)" "$SETTLED" "$SHORT"
  wait_block "$(start_block "$SETTLED")" # bidding opens the block after launch
  bid script/demo/Bidders.s.sol --sig "run(string)" "$SETTLED"
fi

say "refunded: vela, $SHORT-block auction, \$300k of an \$800k minimum"
if ! launched vela; then
  posted vela || run script/demo/PostManifest.s.sol --sig "post(string)" vela
  run script/demo/Launch.s.sol --sig "run(string,uint32)" vela "$SHORT"
  wait_block "$(start_block vela)"
  bid script/demo/Bidders.s.sol --sig "thin(string)" vela
fi

say "settled (part 2): $SETTLED auction ends, the vault collects and opens the pool"
wait_block "$(end_block "$SETTLED")"
run script/demo/Bidders.s.sol --sig "settle(string)" "$SETTLED"
opened_at=$(date +%s)

say "refunded: vela bids get their USDC back"
wait_block "$(end_block vela)"
run script/demo/Bidders.s.sol --sig "settle(string)" vela

say "live: nova, 600-block auction (~2 h), 30 bidders"
if ! launched nova; then
  posted nova || run script/demo/PostManifest.s.sol --sig "post(string)" nova
  run script/demo/Launch.s.sol --sig "run(string,uint32)" nova 600
  wait_block "$(start_block nova)"
  bid script/demo/Bidders.s.sol --sig "run(string)" nova
fi

say "settled (part 3): wait out $SETTLED's 30-minute window, then settle"
left=$((1800 + 30 - ($(date +%s) - opened_at)))
[ "$ANVIL" = 1 ] && left=1830
[ "$left" -gt 0 ] && { echo "  waiting ${left}s for the support window"; wait_secs "$left"; }
preview() { forge script script/demo/Settle.s.sol --sig "preview(string)" "$SETTLED" --rpc-url "$RPC" 2>&1; }
until preview | grep -qE "settle is open|already settled"; do wait_secs 30; done
preview | grep -q "already settled" || run script/demo/Settle.s.sol --sig "run(string)" "$SETTLED"

say "done: open / (Explore) to see every status"
