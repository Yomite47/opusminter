# Universal Agent Minter

A powerful Web3 interface to interact with AI Agent NFT mints via `SKILL.md` specifications. Supports both **Solana** and **EVM** (Ethereum, Base, Optimism) chains.

## Features

- **Universal Parser:** Reads `SKILL.md` from any URL to understand minting requirements.
- **Auto-Solver:** Solves Proof-of-Work challenges (Math, ROT13, Base64, Hex, Reverse String) client-side.
- **Multi-Chain:** 
  - **Solana:** Supports Phantom, Solflare (via Wallet Adapter).
  - **EVM:** Supports MetaMask, Rainbow, Coinbase (via RainbowKit).
- **Monetization:** Built-in fee system (0.005 SOL / 0.0005 ETH) per mint.

## Getting Started

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Run Development Server:**
   ```bash
   npm run dev
   ```

3. **Build for Production:**
   ```bash
   npm run build
   ```

## Deploy on Vercel

1. Push this repository to GitHub.
2. Go to [Vercel](https://vercel.com) and click **"Add New Project"**.
3. Import your repository.
4. Click **Deploy**.

## Configuration

- **Fees:** The fee recipient address is configured in `app/page.tsx`.
- **WalletConnect:** Get your Project ID from [WalletConnect Cloud](https://cloud.walletconnect.com) and update `app/wagmi-config.ts`.
