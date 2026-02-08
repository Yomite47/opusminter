import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import {
  mainnet,
  base,
  optimism,
  polygon,
  zora,
  arbitrum
} from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Universal Agent Minter',
  projectId: 'YOUR_PROJECT_ID', // TODO: User should provide this or we use a public one
  chains: [
    mainnet,
    base,
    optimism,
    polygon,
    zora,
    arbitrum
  ],
  ssr: true,
});
