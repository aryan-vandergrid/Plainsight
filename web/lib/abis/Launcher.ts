export const launcherAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "registry",
        "type": "address",
        "internalType": "contract IManifestRegistry"
      },
      {
        "name": "vestingFactory",
        "type": "address",
        "internalType": "contract VestingWalletFactory"
      },
      {
        "name": "auctions",
        "type": "address",
        "internalType": "contract AuctionDeployer"
      },
      {
        "name": "factory",
        "type": "address",
        "internalType": "contract IVerifiableFactory"
      },
      {
        "name": "userRegistryImpl",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "ethRegistry",
        "type": "address",
        "internalType": "contract IPermissionedRegistry"
      },
      {
        "name": "plainsightRegistry",
        "type": "address",
        "internalType": "contract IPermissionedRegistry"
      },
      {
        "name": "resolver",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "AUCTIONS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract AuctionDeployer"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ENS_FACTORY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IVerifiableFactory"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ETH_REGISTRY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IPermissionedRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PLAINSIGHT_REGISTRY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IPermissionedRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "REGISTRY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IManifestRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "RESOLVER",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "USER_REGISTRY_IMPL",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "VAULT",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract GreenshoeVault"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "VESTING_FACTORY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract VestingWalletFactory"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "auctionInfo",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct AuctionInfo",
        "components": [
          {
            "name": "auction",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "supply",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "startBlock",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "endBlock",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "terms",
            "type": "tuple",
            "internalType": "struct LaunchTerms",
            "components": [
              {
                "name": "saleAmount",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "floorPriceUsdc",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "durationBlocks",
                "type": "uint32",
                "internalType": "uint32"
              }
            ]
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "checks",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "st",
        "type": "uint8[8]",
        "internalType": "enum CheckStatus[8]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "expectedRecords",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple[]",
        "internalType": "struct EnsRecord[]",
        "components": [
          {
            "name": "name",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "label",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "wallet",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "keys",
            "type": "string[]",
            "internalType": "string[]"
          },
          {
            "name": "values",
            "type": "string[]",
            "internalType": "string[]"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lastVerify",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "ok",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "failedCheck",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "at",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "launch",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "terms",
        "type": "tuple",
        "internalType": "struct LaunchTerms",
        "components": [
          {
            "name": "saleAmount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "floorPriceUsdc",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "durationBlocks",
            "type": "uint32",
            "internalType": "uint32"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "auction",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "onERC1155BatchReceived",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes4",
        "internalType": "bytes4"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "onERC1155Received",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes4",
        "internalType": "bytes4"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "postManifest",
    "inputs": [
      {
        "name": "m",
        "type": "tuple",
        "internalType": "struct Manifest",
        "components": [
          {
            "name": "token",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "ensLabel",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "issuer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "allocations",
            "type": "tuple[]",
            "internalType": "struct Allocation[]",
            "components": [
              {
                "name": "label",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "insider",
                "type": "bool",
                "internalType": "bool"
              },
              {
                "name": "wallet",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "amount",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "vesting",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "unlockDate",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "vestingDuration",
                "type": "uint64",
                "internalType": "uint64"
              }
            ]
          },
          {
            "name": "mm",
            "type": "tuple",
            "internalType": "struct MarketMakerDeal",
            "components": [
              {
                "name": "wallet",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "loanAmount",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "strikeUsdc",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "kpis",
                "type": "string",
                "internalType": "string"
              }
            ]
          },
          {
            "name": "agent",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "agentOperator",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "greenshoeBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "windowSecs",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "rangeDepthBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "treasury",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "insiderFeeBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "minRaise",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "manifestHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "jsonURI",
            "type": "string",
            "internalType": "string"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "supportsInterface",
    "inputs": [
      {
        "name": "interfaceId",
        "type": "bytes4",
        "internalType": "bytes4"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "tokenRegistryOf",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IPermissionedRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "verify",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "ok",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "failedCheck",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "AuctionStarted",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "auction",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "supply",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      },
      {
        "name": "saleAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "floorPriceUsdc",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "minRaise",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "startBlock",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "endBlock",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ManifestPosted",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "issuer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "ensLabel",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "tokenRegistry",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Verified",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "ok",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      },
      {
        "name": "failedCheck",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "checks",
        "type": "uint8[8]",
        "indexed": false,
        "internalType": "enum CheckStatus[8]"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VestingDeployed",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "label",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "wallet",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "vesting",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "unlockDate",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AlreadyLaunched",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "AlreadyPosted",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "DNSDecodingFailed",
    "inputs": [
      {
        "name": "dns",
        "type": "bytes",
        "internalType": "bytes"
      }
    ]
  },
  {
    "type": "error",
    "name": "DNSEncodingFailed",
    "inputs": [
      {
        "name": "ens",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "ManifestMissing",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotIssuer",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotVerified",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "failedCheck",
        "type": "uint8",
        "internalType": "uint8"
      }
    ]
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "VestingMustBeEmpty",
    "inputs": [
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "WrongTreasury",
    "inputs": [
      {
        "name": "treasury",
        "type": "address",
        "internalType": "address"
      }
    ]
  }
] as const;
