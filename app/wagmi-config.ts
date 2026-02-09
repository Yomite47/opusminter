import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import {
  mainnet,
  base,
  optimism,
  polygon,
  zora,
  arbitrum
} from 'wagmi/chains';

const megaeth = {
  id: 6343,
  name: 'MegaETH Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://carrot.megaeth.com/rpc'] },
  },
  blockExplorers: {
    default: { name: 'MegaETH Explorer', url: 'https://explorer.megaeth.com' },
  },
  testnet: true,
} as const;

const megaethMainnet = {
  id: 4326,
  name: 'MegaETH Mainnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://alpha.megaeth.com/rpc'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://megaeth-private.blockscout.com' },
  },
  testnet: false,
} as const;

export const config = getDefaultConfig({
  appName: 'Universal Agent Minter',
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'YOUR_PROJECT_ID', // Fallback to placeholder if env var is missing
  chains: [
    mainnet,
    base,
    optimism,
    polygon,
    zora,
    arbitrum,
    megaeth,
    megaethMainnet
  ],
  ssr: false, // Disable SSR to avoid indexedDB errors during build
});
