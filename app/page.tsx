
"use client";

import { useState } from "react";
// Solana
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction, Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
// EVM
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useSendTransaction, useWaitForTransactionReceipt, useWalletClient } from 'wagmi';
import { parseEther } from 'viem';

import { Loader2, CheckCircle, AlertCircle, Coins, Wallet } from "lucide-react";

// --- Configuration ---
const CREATOR_WALLET_SOL = "FJLZ1yc4G9WyVZ56ST23rQa72Zjvmn5RtaFRu9j4eLY3"; // Your Solana Wallet
const CREATOR_WALLET_EVM = "0xcb52f0fe1d559cd2869db7f29753e8951381b4a3"; // REPLACE WITH YOUR EVM WALLET
const FEE_AMOUNT_SOL = 0.005; // ~$1
const FEE_AMOUNT_ETH = 0.0005; // ~$1.50

export default function Home() {
  // Solana State
  const { connection } = useConnection();
  const { publicKey: solPublicKey, sendTransaction: sendSolTx, signTransaction: signSolTx } = useWallet();

  // EVM State
  const { address: evmAddress, isConnected: isEvmConnected, chain: evmChain } = useAccount();
  const { sendTransactionAsync: sendEvmTx } = useSendTransaction();
  const { data: walletClient } = useWalletClient();

  // UI State
  const [url, setUrl] = useState("https://chum-production.up.railway.app/api/villain/skill.md");
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [mode, setMode] = useState<"solana" | "evm">("solana"); // Toggle modes

  const log = (msg: string) => setLogs((prev) => [...prev, msg]);

  // --- Logic from CLI (Ported) ---
  const handleMint = async () => {
    // Check wallet based on mode
    if (mode === "solana" && (!solPublicKey || !signSolTx)) {
      log("❌ Connect Solana wallet first!");
      return;
    }
    if (mode === "evm" && !isEvmConnected) {
      log("❌ Connect EVM wallet first!");
      return;
    }

    setLoading(true);
    setLogs([]);
    setStatus("idle");

    try {
      // 1. Fetch SKILL.md
      log(`🔍 Scanning: ${url}`);
      const res = await fetch(url);
      const text = await res.text();

      // 2. Parse Metadata
      const match = text.match(/^---\n([\s\S]*?)\n---/);
      if (!match) throw new Error("Invalid SKILL.md: No frontmatter");
      
      const config: any = {};
      match[1].split('\n').forEach(line => {
        const [key, ...valParts] = line.split(':');
        if (key && valParts.length) {
          let val = valParts.join(':').trim();
          if (val.startsWith('{') || val.startsWith('[')) {
             try { val = JSON.parse(val); } catch {}
          }
          config[key.trim()] = val;
        }
      });

      const apiBase = config.metadata?.api_base;
      if (!apiBase) throw new Error("No api_base found in metadata");
      log(`✅ API Base: ${apiBase}`);

      // 3. Get Challenge
      log("🤖 Requesting Challenge...");
      const walletAddr = mode === "solana" ? solPublicKey?.toBase58() : evmAddress;
      
      const cRes = await fetch(`${apiBase}/villain/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: walletAddr, chain: mode }) // Added chain param if API supports it
      });
      
      // Handle non-JSON response gracefully
      const cText = await cRes.text();
      let cData;
      try {
          cData = JSON.parse(cText);
      } catch (e) {
          throw new Error(`API Error (Not JSON): ${cText.substring(0, 100)}...`);
      }
      
      if (!cData.challenge) throw new Error("API Error: " + JSON.stringify(cData));
      
      const challenge = cData.challenge;
      log(`🧩 Solving: "${challenge}"`);

      // 4. Solve Challenge
      let answer;
      if (challenge.startsWith("What is ")) {
          const mathStr = challenge.replace("What is ", "").replace("?", "");
          answer = eval(mathStr); 
      } else if (challenge.startsWith("Decode ROT13: ")) {
          answer = challenge.replace("Decode ROT13: ", "").replace(/[a-zA-Z]/g, (c: string) =>
              String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26));
      } else if (challenge.startsWith("Decode hex to ASCII: ")) {
          const hex = challenge.replace("Decode hex to ASCII: ", "");
          answer = hex.match(/.{1,2}/g)?.map((byte: string) => String.fromCharCode(parseInt(byte, 16))).join('');
      } else if (challenge.startsWith("Decode base64: ")) {
          answer = atob(challenge.replace("Decode base64: ", ""));
      } else if (challenge.startsWith("Reverse string: ") || challenge.startsWith("Reverse this string: ")) {
          answer = challenge.replace(/^Reverse (this )?string: /, "").split("").reverse().join("");
      } else {
          throw new Error("Unknown challenge type");
      }
      log(`✅ Answer: ${answer}`);

      // 5. Submit Answer
      log("📤 Submitting...");
      const mRes = await fetch(`${apiBase}/villain/agent-mint`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              walletAddress: walletAddr,
              challengeId: cData.challengeId,
              answer: String(answer),
              chain: mode // Tell backend which chain
          })
      });
      const mData = await mRes.json();
      if (mData.error) throw new Error(`Mint Error: ${JSON.stringify(mData)}`);

      // 6. Sign & Monetize
      if (mode === "solana") {
          // --- SOLANA FLOW ---
          log("✍️ Preparing Solana Transaction...");
          const txBuffer = Buffer.from(mData.transaction, "base64");
          
          // Fee
          log(`💰 Sending ${FEE_AMOUNT_SOL} SOL Fee...`);
          const feeTx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: solPublicKey!,
              toPubkey: new PublicKey(CREATOR_WALLET_SOL),
              lamports: FEE_AMOUNT_SOL * LAMPORTS_PER_SOL,
            })
          );
          const feeSig = await sendSolTx(feeTx, connection);
          await connection.confirmTransaction(feeSig);
          log("✅ Fee Paid!");

          // Mint
          log("🚀 Executing Mint...");
          const mintTx = VersionedTransaction.deserialize(txBuffer);
          const signedTx = await signSolTx!(mintTx);
          const sig = await connection.sendRawTransaction(signedTx.serialize());
          log(`🎉 Success! Tx: https://solscan.io/tx/${sig}`);

      } else {
          // --- EVM FLOW ---
          log("✍️ Preparing EVM Transaction...");
          
          // Fee
          log(`💰 Sending ${FEE_AMOUNT_ETH} ETH Fee...`);
          const feeHash = await sendEvmTx({
              to: CREATOR_WALLET_EVM as `0x${string}`,
              value: parseEther(FEE_AMOUNT_ETH.toString())
          });
          log(`✅ Fee Paid! Tx: ${feeHash}`);
          
          // Mint
          // Assuming backend returns 'to', 'data', 'value' for EVM
          // If backend returns raw serialized tx, we might need different handling
          if (mData.transaction) {
              // If backend returns a raw transaction hex
              const hash = await walletClient?.sendRawTransaction({
                  serializedTransaction: mData.transaction
              });
              log(`🎉 Success! Tx: ${hash}`);
          } else if (mData.to && mData.data) {
              // Construct tx
              const hash = await sendEvmTx({
                  to: mData.to,
                  data: mData.data,
                  value: mData.value ? BigInt(mData.value) : 0n
              });
              log(`🎉 Success! Tx: ${hash}`);
          } else {
              throw new Error("Unknown EVM Transaction format from backend");
          }
      }

      setStatus("success");

    } catch (e: any) {
      console.error(e);
      log(`❌ Error: ${e.message}`);
      setStatus("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-mono p-8 flex flex-col items-center">
      <div className="max-w-2xl w-full space-y-8">
        
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-neutral-800 pb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                Universal Agent Minter
              </h1>
              <p className="text-neutral-500 text-sm mt-1">Mint any Agent NFT via SKILL.md</p>
            </div>
            
            {/* Network Toggle */}
            <div className="flex bg-neutral-900 rounded-lg p-1 border border-neutral-800">
                <button 
                    onClick={() => setMode("solana")}
                    className={`px-4 py-2 rounded text-sm font-bold transition-all ${mode === "solana" ? "bg-emerald-600 text-white" : "text-neutral-400 hover:text-white"}`}
                >
                    Solana
                </button>
                <button 
                    onClick={() => setMode("evm")}
                    className={`px-4 py-2 rounded text-sm font-bold transition-all ${mode === "evm" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"}`}
                >
                    EVM
                </button>
            </div>
          </div>

          {/* Wallet Buttons */}
          <div className="flex justify-end">
            {mode === "solana" ? (
                <WalletMultiButton className="!bg-emerald-600 hover:!bg-emerald-700" />
            ) : (
                <ConnectButton />
            )}
          </div>
        </div>

        {/* Input */}
        <div className="space-y-4">
          <label className="block text-sm font-medium text-neutral-400">Target SKILL.md URL</label>
          <div className="flex gap-2">
            <input 
              type="text" 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors"
              placeholder="https://..."
            />
          </div>
          <p className="text-xs text-neutral-500">
            Fee: {mode === "solana" ? `${FEE_AMOUNT_SOL} SOL` : `${FEE_AMOUNT_ETH} ETH`} (Support the developer)
          </p>
        </div>

        {/* Action */}
        <button
          onClick={handleMint}
          disabled={loading || (mode === "solana" ? !solPublicKey : !isEvmConnected)}
          className={`w-full py-4 rounded font-bold text-lg transition-all flex items-center justify-center gap-2
            ${(mode === "solana" ? !solPublicKey : !isEvmConnected) ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed' : 
              loading ? 'bg-emerald-800 text-emerald-200 cursor-wait' : 
              mode === "solana" ? 'bg-emerald-500 text-black hover:bg-emerald-400' : 'bg-blue-600 text-white hover:bg-blue-500'}
          `}
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Coins className="w-5 h-5" />
              Mint {mode === "solana" ? "on Solana" : "on EVM"}
            </>
          )}
        </button>

        {/* Logs */}
        <div className="bg-neutral-900 rounded-lg p-4 font-mono text-sm h-64 overflow-y-auto border border-neutral-800 space-y-2">
            {logs.length === 0 && <span className="text-neutral-600">Waiting for commands...</span>}
            {logs.map((msg, i) => (
                <div key={i} className="border-b border-neutral-800/50 pb-1 last:border-0 last:pb-0">
                    {msg}
                </div>
            ))}
        </div>
      </div>
    </div>
  );
}
