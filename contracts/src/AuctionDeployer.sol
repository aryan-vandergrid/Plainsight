// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {AuctionParameters, IContinuousClearingAuctionFactory} from "./interfaces/ICCA.sol";
import {LaunchTerms} from "./interfaces/ILauncher.sol";

contract AuctionDeployer {
    uint32 public constant MIN_DURATION_BLOCKS = 10;
    uint32 public constant MAX_DURATION_BLOCKS = 50_400;
    uint16 public constant MAX_GREENSHOE_BPS = 5000;
    uint256 public constant TICKS_PER_FLOOR = 100;

    uint24 internal constant MPS = 1e7;
    uint24 internal constant FINAL_BLOCK_MIN_MPS = 3e6;
    uint128 internal constant CCA_MAX_TOTAL_SUPPLY = 1 << 100;
    uint256 internal constant CCA_MIN_FLOOR_PRICE = (1 << 32) + 1;
    uint256 internal constant CCA_MIN_TICK_SPACING = 2;

    IContinuousClearingAuctionFactory public immutable FACTORY;
    address public immutable USDC;
    address public immutable VAULT;
    address public immutable deployer;
    address public launcher;

    event LauncherSet(address launcher);

    error NotDeployer();
    error NotLauncher();
    error LauncherAlreadySet();
    error InvalidSaleAmount();
    error SupplyTooLarge(uint256 supply);
    error InvalidDuration(uint32 blocks, uint32 min, uint32 max);
    error InvalidGreenshoe(uint16 bps);
    error MinRaiseRequired();
    error MinRaiseTooLarge(uint256 minRaise);
    error UnsupportedTokenDecimals(address token);
    error FloorPriceTooLow(uint256 floorPriceUsdc);
    error FloorPriceTooHigh(uint256 floorPriceUsdc);

    constructor(IContinuousClearingAuctionFactory factory, address usdc, address vault) {
        FACTORY = factory;
        USDC = usdc;
        VAULT = vault;
        deployer = msg.sender;
    }

    function setLauncher(address launcher_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (launcher != address(0)) revert LauncherAlreadySet();
        launcher = launcher_;
        emit LauncherSet(launcher_);
    }

    function deploy(bytes32 id, address token, uint16 greenshoeBps, uint256 minRaise, LaunchTerms calldata t)
        external
        returns (address auction, uint128 supply, uint64 startBlock, uint64 endBlock)
    {
        if (msg.sender != launcher) revert NotLauncher();
        startBlock = uint64(block.number + 1);
        bytes memory configData;
        (supply, configData) = configFor(token, greenshoeBps, minRaise, t, startBlock);
        endBlock = startBlock + t.durationBlocks;
        auction = FACTORY.create(token, supply, configData, id);
    }

    function expectedAuction(
        bytes32 id,
        address token,
        uint16 greenshoeBps,
        uint256 minRaise,
        LaunchTerms calldata t,
        uint64 startBlock
    ) external view returns (address) {
        (uint128 supply, bytes memory configData) = configFor(token, greenshoeBps, minRaise, t, startBlock);
        return FACTORY.getAddress(token, supply, configData, id, address(this));
    }

    function manifestValid(uint16 greenshoeBps, uint256 minRaise) public pure returns (bool) {
        return greenshoeBps > 0 && greenshoeBps <= MAX_GREENSHOE_BPS && minRaise > 0 && minRaise <= type(uint128).max;
    }

    function configFor(address token, uint16 greenshoeBps, uint256 minRaise, LaunchTerms calldata t, uint64 startBlock)
        public
        view
        returns (uint128 supply, bytes memory configData)
    {
        if (greenshoeBps == 0 || greenshoeBps > MAX_GREENSHOE_BPS) revert InvalidGreenshoe(greenshoeBps);
        if (minRaise == 0) revert MinRaiseRequired();
        if (minRaise > type(uint128).max) revert MinRaiseTooLarge(minRaise);
        if (t.saleAmount == 0) revert InvalidSaleAmount();
        if (t.saleAmount > CCA_MAX_TOTAL_SUPPLY) revert SupplyTooLarge(t.saleAmount);
        if (t.durationBlocks < MIN_DURATION_BLOCKS || t.durationBlocks > MAX_DURATION_BLOCKS) {
            revert InvalidDuration(t.durationBlocks, MIN_DURATION_BLOCKS, MAX_DURATION_BLOCKS);
        }
        uint256 s = t.saleAmount * (10_000 + uint256(greenshoeBps)) / 10_000;
        if (s > CCA_MAX_TOTAL_SUPPLY) revert SupplyTooLarge(s);
        supply = uint128(s);

        (uint256 floorQ96, uint256 tickQ96) = priceGrid(token, t.floorPriceUsdc);
        configData = abi.encode(
            AuctionParameters({
                currency: USDC,
                tokensRecipient: VAULT,
                fundsRecipient: VAULT,
                startBlock: startBlock,
                endBlock: startBlock + t.durationBlocks,
                claimBlock: startBlock + t.durationBlocks,
                tickSpacing: tickQ96,
                validationHook: address(0),
                floorPrice: floorQ96,
                requiredCurrencyRaised: uint128(minRaise),
                auctionStepsData: schedule(t.durationBlocks)
            })
        );
    }

    function priceGrid(address token, uint256 floorPriceUsdc) public view returns (uint256 floorQ96, uint256 tickQ96) {
        uint8 dec = _decimals(token);
        if (floorPriceUsdc > type(uint128).max) revert FloorPriceTooHigh(floorPriceUsdc);
        tickQ96 = (floorPriceUsdc << 96) / (10 ** dec) / TICKS_PER_FLOOR;
        floorQ96 = tickQ96 * TICKS_PER_FLOOR;
        if (tickQ96 < CCA_MIN_TICK_SPACING || floorQ96 < CCA_MIN_FLOOR_PRICE) revert FloorPriceTooLow(floorPriceUsdc);
    }

    function schedule(uint32 blocks) public pure returns (bytes memory) {
        uint256 n = blocks - 1;
        uint24 perBlock = uint24((MPS - FINAL_BLOCK_MIN_MPS) / n);
        uint24 last = uint24(MPS - perBlock * n);
        return abi.encodePacked(_step(perBlock, blocks - 1), _step(last, 1));
    }

    function _step(uint24 mps, uint40 blockDelta) private pure returns (bytes8) {
        return bytes8((uint64(mps) << 40) | uint64(blockDelta));
    }

    function _decimals(address token) private view returns (uint8 dec) {
        try IERC20Metadata(token).decimals() returns (uint8 d) {
            dec = d;
        } catch {
            revert UnsupportedTokenDecimals(token);
        }
        if (dec < 6 || dec > 18) revert UnsupportedTokenDecimals(token);
    }
}
