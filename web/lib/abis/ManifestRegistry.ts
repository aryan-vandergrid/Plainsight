export const manifestRegistryAbi = [
  {
    "type": "constructor",
    "inputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "MAX_ALLOCATIONS",
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
    "name": "amend",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "newHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "uri",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "amendments",
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
        "internalType": "struct Amendment[]",
        "components": [
          {
            "name": "manifestHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "uri",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "timestamp",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      }
    ],
    "stateMutability": "view"
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
    "name": "get",
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
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "idOf",
    "inputs": [
      {
        "name": "ensLabel",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "isInsider",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
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
    "name": "lock",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "postedAt",
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
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "register",
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
    "type": "function",
    "name": "status",
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
        "type": "uint8",
        "internalType": "enum ManifestStatus"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "LauncherSet",
    "inputs": [
      {
        "name": "launcher",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ManifestAmended",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "index",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "manifestHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "uri",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ManifestLocked",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ManifestRegistered",
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
        "name": "manifestHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "DuplicateAllocation",
    "inputs": [
      {
        "name": "label",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidLabel",
    "inputs": [
      {
        "name": "label",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidManifest",
    "inputs": [
      {
        "name": "reason",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "LauncherAlreadySet",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ManifestIsLocked",
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
    "name": "NotDeployer",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotIssuerOrLauncher",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotLauncher",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReservedLabel",
    "inputs": [
      {
        "name": "label",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "TooManyAllocations",
    "inputs": [
      {
        "name": "count",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "max",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  }
] as const;
