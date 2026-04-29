# 🔒 StellarEscrow — Trustless P2P Escrow on Stellar

A fully on-chain escrow service built with a **Soroban smart contract** on Stellar Testnet. Lock XLM into the contract, release it when work is delivered, or reclaim it after the deadline — no middlemen, no trust required.

---

## Live Demo

> **[🚀 Live App →](https://stellar-escrow.vercel.app)**
> *(Deploy to Vercel and update this link)*

## Demo Video

> **[▶ 1-Minute Demo →](https://www.loom.com/share/fdb1ed0d4e66480a90ac5568608439f3)**

---

## Deployed Contract

| | |
|---|---|
| **Contract ID** | `CCW67UZP3KNQTR72GTTYPQJ3E6ZDHCJTQQQ2ZC53ORXJU6DUYLMZMHH7` |
| **Network** | Stellar Testnet |
| **Native Token** | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| **Explorer** | [View Contract](https://stellar.expert/explorer/testnet/contract/CCW67UZP3KNQTR72GTTYPQJ3E6ZDHCJTQQQ2ZC53ORXJU6DUYLMZMHH7) |
| **Deploy Tx** | [b86cb9ec…](https://stellar.expert/explorer/testnet/tx/b86cb9ec9ed3567cf84530ffd8bfeeb85e99ac872c55a001d8ace96766e08865) |
| **Init Tx** | [704d7b64…](https://stellar.expert/explorer/testnet/tx/704d7b646334cff8c7fd310dade3e41b6a2d37eb165bd1869ffdbeab1ca43293) |

---

## Why StellarEscrow?

P2P trades and freelance payments run on trust — and trust fails. StellarEscrow replaces trust with code:

- **Creator** locks XLM in the smart contract when hiring
- **Recipient** delivers the work
- **Creator** releases funds with one click — or reclaims after deadline
- The **smart contract** holds the funds. Not you. Not us.

---

## Features

### Core dApp
- Multi-wallet connect via **StellarWalletsKit** (Freighter · xBull · LOBSTR)
- Create escrow: lock XLM with a title, recipient address, and deadline
- Release funds to recipient (creator only)
- Reclaim refund after deadline passes (creator only)
- Dashboard: Sent / Received tabs, live stats bar, auto-refresh every 15s

### UX & Loading States
- Skeleton card placeholders while escrows load
- Animated progress ring on Create button during signing
- Transaction toast: pending spinner → success with Explorer link → error
- Spinning button while release/refund is in-flight
- "Overdue" badge on expired active escrows

### Caching
- `localStorage` cache with 20s TTL per escrow entry
- 15s TTL for the full escrow list per address
- Cache immediately invalidated after any write operation

### Error Handling (3+ types)
| Code | When triggered | User message |
|---|---|---|
| `WALLET_NOT_FOUND` | Extension not installed | "Wallet extension not found. Install Freighter, xBull, or LOBSTR." |
| `USER_REJECTED` | User cancels signing | "You cancelled the transaction." |
| `INSUFFICIENT_FUNDS` | Not enough XLM | "Insufficient XLM balance to cover this transaction." |
| `CONTRACT_ERROR` | Double-release, pre-deadline refund | Exact Soroban panic message |
| `TX_TIMEOUT` | Network congestion | "Transaction timed out." |

---

## Smart Contract

**Language:** Rust (Soroban SDK v22) | **File:** `contracts/escrow/src/lib.rs`

### Contract Functions

| Function | Description |
|---|---|
| `init(token)` | One-time init with native XLM token contract address |
| `create(creator, recipient, amount, deadline, title)` | Lock XLM and create escrow → returns `u64` ID |
| `release(caller, id)` | Transfer funds to recipient (creator only) |
| `refund(caller, id)` | Return funds to creator after deadline |
| `get_escrow(id)` | Read escrow state by ID |
| `count()` | Total escrows ever created |

### Escrow Lifecycle

```
create() called → XLM transferred to contract → Status: Active
                                                     │
                        ┌────────────────────────────┤
                        │                            │
              release() called              deadline passed + refund() called
                        ↓                            ↓
               Status: Released               Status: Refunded
               Recipient gets XLM             Creator gets XLM back
```

---

## Tests — 6 Passing

```
running 6 tests
test test::test_create_escrow                   ... ok
test test::test_release_pays_recipient          ... ok
test test::test_refund_after_deadline           ... ok
test test::test_cannot_release_twice            ... ok
test test::test_cannot_refund_before_deadline   ... ok
test test::test_multiple_escrows                ... ok

test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured
```

Run yourself:
```bash
cargo test --manifest-path contracts/escrow/Cargo.toml
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite 8 |
| Wallets | `@creit.tech/stellar-wallets-kit` v2 |
| Stellar SDK | `@stellar/stellar-sdk` v15 |
| Smart Contract | Rust · Soroban SDK v22 |
| Network | Stellar Testnet · Soroban RPC |
| Caching | `localStorage` with TTL |

---

## Setup & Run Locally

**Prerequisites:**
- [Freighter](https://freighter.app), xBull, or LOBSTR browser extension set to **Testnet**
- Testnet XLM from [friendbot.stellar.org](https://friendbot.stellar.org)
- Node.js 18+

```bash
# 1. Clone
git clone https://github.com/<your-username>/stellar-escrow.git
cd stellar-escrow

# 2. Install
npm install

# 3. Run (contract already deployed — .env is committed)
npm run dev
```

Open **http://localhost:5173**

```bash
# Production build
npm run build && npm run preview
```

---

## Deploy Your Own Contract

```bash
# 1. Rust + WASM target
rustup target add wasm32v1-none

# 2. Build
stellar contract build

# 3. Fund a deployer
stellar keys generate deployer --network testnet
# curl https://friendbot.stellar.org/?addr=<ADDRESS>

# 4. Deploy
stellar contract deploy \
  --wasm target/wasm32v1-none/release/escrow.wasm \
  --source deployer --network testnet

# 5. Get native token ID
stellar contract id asset --asset native --network testnet

# 6. Initialize
stellar contract invoke \
  --id <CONTRACT_ID> --source deployer --network testnet \
  -- init --token <NATIVE_TOKEN_ID>

# 7. Set env
echo "VITE_CONTRACT_ID=<CONTRACT_ID>"  > .env
echo "VITE_NATIVE_TOKEN=<NATIVE_TOKEN_ID>" >> .env
```

---

## Project Structure

```
stellar-escrow/
├── contracts/escrow/
│   ├── Cargo.toml
│   └── src/lib.rs          ← Soroban contract + 6 unit tests
├── src/
│   ├── components/
│   │   ├── CreateEscrow.jsx  ← Form with deadline presets + progress ring
│   │   ├── EscrowCard.jsx    ← Card UI + skeleton loader
│   │   └── TxToast.jsx       ← Animated toast with progress bar
│   ├── lib/
│   │   ├── wallets.js        ← StellarWalletsKit + error classifier (5 types)
│   │   ├── contract.js       ← simulate → assemble → sign → submit → poll
│   │   └── cache.js          ← localStorage cache with TTL
│   ├── App.jsx               ← Dashboard, tabs, stats, auto-poll
│   └── index.css             ← Dark design system (600+ lines)
├── .env                      ← Contract ID (testnet, safe to commit)
└── README.md
```

---

## License

MIT
