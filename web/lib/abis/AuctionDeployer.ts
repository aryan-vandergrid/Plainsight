export const auctionDeployerAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "factory",
        "type": "address",
        "internalType": "contract IContinuousClearingAuctionFactory"
      },
      {
        "name": "usdc",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "FACTORY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IContinuousClearingAuctionFactory"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_DURATION_BLOCKS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_GREENSHOE_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_DURATION_BLOCKS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "TICKS_PER_FLOOR",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "USDC",
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
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "configFor",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "greenshoeBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "minRaise",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "t",
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
      },
      {
        "name": "startBlock",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [
      {
        "name": "supply",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "configData",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "deploy",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "greenshoeBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "minRaise",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "t",
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
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "deployer",
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
    "name": "expectedAuction",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "greenshoeBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "minRaise",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "t",
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
      },
      {
        "name": "startBlock",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
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
    "name": "launcher",
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
    "name": "manifestValid",
    "inputs": [
      {
        "name": "greenshoeBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "minRaise",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "priceGrid",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "floorPriceUsdc",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "floorQ96",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "tickQ96",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "schedule",
    "inputs": [
      {
        "name": "blocks",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "setLauncher",
    "inputs": [
      {
        "name": "launcher_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "LauncherSet",
    "inputs": [
      {
        "name": "launcher",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "FloorPriceTooHigh",
    "inputs": [
      {
        "name": "floorPriceUsdc",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "FloorPriceTooLow",
    "inputs": [
      {
        "name": "floorPriceUsdc",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidDuration",
    "inputs": [
      {
        "name": "blocks",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "min",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "max",
        "type": "uint32",
        "internalType": "uint32"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidGreenshoe",
    "inputs": [
      {
        "name": "bps",
        "type": "uint16",
        "internalType": "uint16"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidSaleAmount",
    "inputs": []
  },
  {
    "type": "error",
    "name": "LauncherAlreadySet",
    "inputs": []
  },
  {
    "type": "error",
    "name": "MinRaiseRequired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "MinRaiseTooLarge",
    "inputs": [
      {
        "name": "minRaise",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotDeployer",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotLauncher",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SupplyTooLarge",
    "inputs": [
      {
        "name": "supply",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "UnsupportedTokenDecimals",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  }
] as const;
