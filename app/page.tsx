"use client";

import { useState } from "react";
// Solana
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction, Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
// EVM
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useSendTransaction, useWalletClient } from 'wagmi';
import { parseEther } from 'viem';

import { Loader2, AlertCircle, Coins } from "lucide-react";

// --- Configuration ---
const CREATOR_WALLET_SOL = "FJLZ1yc4G9WyVZ56ST23rQa72Zjvmn5RtaFRu9j4eLY3"; // Your Solana Wallet
const CREATOR_WALLET_EVM = "0xcb52f0fe1d559cd2869db7f29753e8951381b4a3"; // REPLACE WITH YOUR EVM WALLET
const FEE_AMOUNT_SOL = 0.005; // ~$1
const FEE_AMOUNT_ETH = 0.0005; // ~$1.50

interface Endpoints {
    challenge: string;
    mint: string;
    execute: string | null;
}

interface ChallengeData {
    endpoints: Endpoints;
    walletAddr: string;
    challengeId: string;
}

export default function Home() {
  // Solana State
  const { connection } = useConnection();
  const { publicKey: solPublicKey, sendTransaction: sendSolTx, signTransaction: signSolTx } = useWallet();

  // EVM State
  const { address: evmAddress, isConnected: isEvmConnected } = useAccount();
  const { sendTransactionAsync: sendEvmTx } = useSendTransaction();
  const { data: walletClient } = useWalletClient();

  // UI State
  const [url, setUrl] = useState("https://chum-production.up.railway.app/api/villain/skill.md");
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"solana" | "evm">("solana"); // Toggle modes

  // Manual Challenge Solver State
  const [manualChallenge, setManualChallenge] = useState<string | null>(null);
  const [manualAnswer, setManualAnswer] = useState("");
  const [challengeData, setChallengeData] = useState<ChallengeData | null>(null); // Store challenge context for manual submission

  const log = (msg: string) => setLogs((prev) => [...prev, msg]);

  // Helper: Fetch via Proxy to avoid CORS (with Retry Logic)
  const fetchProxy = async (targetUrl: string, options: RequestInit = {}, retries = 5, delay = 2000) => {
      for (let i = 0; i <= retries; i++) {
          try {
              const res = await fetch('/api/proxy', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      url: targetUrl,
                      method: options.method || 'GET',
                      headers: options.headers || {},
                      body: options.body ? JSON.parse(options.body as string) : undefined
                  })
              });

              if (!res.ok) {
                  const errText = await res.text();
                  // Check for 429 (Rate Limit) or 503 (Service Unavailable)
                  const isRateLimit = res.status === 429 || res.status === 503 || 
                                      errText.includes("429") || errText.includes("503") || 
                                      errText.includes("Too Many Requests") || errText.includes("Service temporarily unavailable");
                  
                  if (isRateLimit && i < retries) {
                      log(`⚠️ Server Busy (${res.status}). Retrying in ${delay/1000}s... (Attempt ${i+1}/${retries})`);
                      await new Promise(r => setTimeout(r, delay));
                      delay *= 1.5; // Backoff
                      continue; 
                  }
                  
                  throw new Error(`Proxy Error (${res.status}): ${errText}`);
              }
              return res;
          } catch (err: any) {
             // Only retry on rate limits or if it's the last attempt rethrow
             if (i < retries && (err.message.includes("429") || err.message.includes("503") || err.message.includes("Too Many Requests"))) {
                 log(`⚠️ Server Busy. Retrying in ${delay/1000}s...`);
                 await new Promise(r => setTimeout(r, delay));
                 delay *= 1.5;
                 continue;
             }
             throw err;
          }
      }
      throw new Error("Max retries exceeded");
  };

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
    setManualChallenge(null); // Reset manual state
    setManualAnswer("");

    try {
      // 1. Fetch SKILL.md
      log(`🔍 Scanning: ${url}`);
      // Use Proxy for SKILL.md as well
      const res = await fetchProxy(url);
      const text = await res.text();

      // 2. Parse Metadata & Endpoints
      let config: Record<string, any> = {};
      let endpoints: Endpoints = {
          challenge: "",
          mint: "",
          execute: null
      };

      const match = text.match(/^---\n([\s\S]*?)\n---/);
      if (match) {
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
        if (apiBase) {
            endpoints.challenge = `${apiBase}/villain/challenge`;
            endpoints.mint = `${apiBase}/villain/agent-mint`;
        }
      }

      // Fallback: Scan text for endpoints if missing
      if (!endpoints.challenge) {
           log("⚠️ No standard metadata. Scanning text for endpoints...");
           const baseUrlMatch = text.match(/Base URL:\s*(https?:\/\/[^\s]+)/i);
           const apiBase = baseUrlMatch ? baseUrlMatch[1] : null;

           const challengeMatch = text.match(/POST\s+(https?:\/\/[^\s]+\/challenge)/i);
           endpoints.challenge = challengeMatch ? challengeMatch[1] : (apiBase ? `${apiBase}/api/challenge` : "");

           const mintMatch = text.match(/POST\s+(https?:\/\/[^\s]+\/mint)/i);
           endpoints.mint = mintMatch ? mintMatch[1] : (apiBase ? `${apiBase}/api/mint` : "");

           const executeMatch = text.match(/POST\s+(https?:\/\/[^\s]+\/execute)/i);
           if (executeMatch) endpoints.execute = executeMatch[1];
      }

      if (!endpoints.challenge) throw new Error("Could not determine API endpoints from SKILL.md");
      log(`✅ Challenge Endpoint: ${endpoints.challenge}`);

      // 3. Get Challenge
      log("🤖 Requesting Challenge...");
      const walletAddr = mode === "solana" ? solPublicKey?.toBase58() : evmAddress;
      
      const cRes = await fetchProxy(endpoints.challenge, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: walletAddr, chain: mode }) // Added chain param if API supports it
      });
      
      // Handle non-JSON response gracefully
      const cText = await cRes.text();
      let cData;
      try {
          cData = JSON.parse(cText);
      } catch {
          throw new Error(`API Error (Not JSON): ${cText.substring(0, 100)}...`);
      }
      
      if (!cData.challenge) throw new Error("API Error: " + JSON.stringify(cData));
      
      const challenge = cData.challenge;
      log(`🧩 Solving: "${challenge}"`);

      // 4. Solve Challenge
      let answer;
      try {
        if (challenge.startsWith("What is ")) {
            const mathStr = challenge.replace("What is ", "").replace("?", "");
            // SECURITY: Sanitize math input to prevent arbitrary code execution
            if (!/^[0-9+\-*/().\s]+$/.test(mathStr)) {
               throw new Error("Invalid characters in math challenge");
            }
            // Safe evaluation using Function constructor with strict numeric check
            answer = new Function(`return ${mathStr}`)(); 
        } else if (challenge.startsWith("Decode ROT13: ")) {
            answer = challenge.replace("Decode ROT13: ", "").replace(/[a-zA-Z]/g, (char: string) => {
                const code = char.charCodeAt(0);
                const limit = char <= "Z" ? 90 : 122;
                let newCode = code + 13;
                if (newCode > limit) newCode -= 26;
                return String.fromCharCode(newCode);
            });
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
        // If solved, proceed to submit immediately
        await submitAnswer(endpoints, walletAddr!, cData.challengeId, answer);

      } catch (err: unknown) {
         if (err instanceof Error && err.message === "Unknown challenge type") {
             // FALLBACK: Ask user to solve it manually
             log(`⚠️ Unknown Challenge Type! Requesting Manual Input...`);
             setManualChallenge(challenge);
             if (walletAddr) {
                 setChallengeData({ endpoints, walletAddr, challengeId: cData.challengeId });
             }
             setLoading(false); // Stop loading spinner so user can interact
             return; // Exit and wait for user input
         } else {
             throw err; // Re-throw real errors
         }
      }

    } catch (e: unknown) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      log(`❌ Error: ${errorMessage}`);
      setLoading(false);
    }
  };

  const submitManualAnswer = async () => {
      if (!manualAnswer || !challengeData) return;
      setLoading(true);
      try {
          await submitAnswer(challengeData.endpoints, challengeData.walletAddr, challengeData.challengeId, manualAnswer);
          setManualChallenge(null); // Clear manual mode
      } catch (e: unknown) {
          console.error(e);
          const errorMessage = e instanceof Error ? e.message : String(e);
          log(`❌ Error: ${errorMessage}`);
      } finally {
          setLoading(false);
      }
  };

  const submitAnswer = async (endpoints: Endpoints, walletAddr: string, challengeId: string, answer: string | number) => {
      // 5. Submit Answer
      log("📤 Submitting...");
      const mRes = await fetchProxy(endpoints.mint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              walletAddress: walletAddr,
              challengeId: challengeId,
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
          
          // Get blockhash explicitly for better confirmation handling
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
          
          const feeTx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: solPublicKey!,
              toPubkey: new PublicKey(CREATOR_WALLET_SOL),
              lamports: FEE_AMOUNT_SOL * LAMPORTS_PER_SOL,
            })
          );
          
          // Assign blockhash manually to ensure we track the right one
          feeTx.recentBlockhash = blockhash;
          feeTx.feePayer = solPublicKey!;

          const feeSig = await sendSolTx(feeTx, connection);
          
          log("⏳ Confirming Fee...");
          
          // Manual polling loop for confirmation (Robust for congested network)
          let confirmed = false;
          const startTime = Date.now();
          
          while (!confirmed && Date.now() - startTime < 60000) { // 60s timeout
              const status = await connection.getSignatureStatus(feeSig);
              
              if (status.value?.confirmationStatus === 'confirmed' || status.value?.confirmationStatus === 'finalized') {
                  confirmed = true;
                  log("✅ Fee Paid!");
                  break;
              }
              
              if (status.value?.err) {
                  throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
              }
              
              await new Promise(r => setTimeout(r, 2000)); // Check every 2s
          }
          
          if (!confirmed) {
              // Final check before giving up
              const status = await connection.getSignatureStatus(feeSig);
              if (status.value?.confirmationStatus === 'confirmed' || status.value?.confirmationStatus === 'finalized') {
                   log("✅ Fee Paid (Recovered)!");
              } else {
                   throw new Error(`Transaction confirmation timed out. Check Explorer: https://solscan.io/tx/${feeSig}`);
              }
          }

          // Mint
          log("🚀 Executing Mint...");
          const mintTx = VersionedTransaction.deserialize(txBuffer);
          const signedTx = await signSolTx!(mintTx);

          if (endpoints.execute) {
              // 3-Step Flow (Clawgles)
              log("🚀 Submitting Signed Transaction to Agent...");
              const signedBase64 = Buffer.from(signedTx.serialize()).toString("base64");
              
              const eRes = await fetchProxy(endpoints.execute, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      transaction: signedBase64,
                      nftMint: mData.nftMint
                  })
              });
              const eData = await eRes.json();
              if (eData.signature) {
                  log(`🎉 Success! Tx: https://solscan.io/tx/${eData.signature}`);
              } else {
                  log(`⚠️ Finished, but no signature returned: ${JSON.stringify(eData)}`);
              }
          } else {
              // Standard Flow
              const sig = await connection.sendRawTransaction(signedTx.serialize());
              log(`🎉 Success! Tx: https://solscan.io/tx/${sig}`);
          }

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
          if (mData.transaction) {
              const hash = await walletClient?.sendRawTransaction({
                  serializedTransaction: mData.transaction
              });
              log(`🎉 Success! Tx: ${hash}`);
          } else if (mData.to && mData.data) {
              const hash = await sendEvmTx({
                  to: mData.to,
                  data: mData.data,
                  value: mData.value ? BigInt(mData.value) : BigInt(0)
              });
              log(`🎉 Success! Tx: ${hash}`);
          } else {
              throw new Error("Unknown EVM Transaction format from backend");
          }
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
              className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-4 py-3 text-base focus:outline-none focus:border-emerald-500 transition-colors"
              placeholder="https://..."
            />
          </div>
          <p className="text-xs text-neutral-500">
            Fee: {mode === "solana" ? `${FEE_AMOUNT_SOL} SOL` : `${FEE_AMOUNT_ETH} ETH`} (Support the developer)
          </p>
        </div>

        {/* Manual Challenge Input */}
        {manualChallenge && (
            <div className="bg-yellow-900/20 border border-yellow-700/50 p-4 rounded-lg space-y-3 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                    <div>
                        <h3 className="font-bold text-yellow-500">Manual Solver Required</h3>
                        <p className="text-sm text-yellow-200/80">
                            The agent sent a challenge I don&apos;t know how to solve automatically.
                        </p>
                        <div className="mt-2 bg-black/50 p-2 rounded text-yellow-100 font-mono text-sm border border-yellow-900/50">
                            {manualChallenge}
                        </div>
                    </div>
                </div>
                
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={manualAnswer}
                        onChange={(e) => setManualAnswer(e.target.value)}
                        placeholder="Type your answer here..."
                        className="flex-1 bg-black/30 border border-yellow-700/50 rounded px-3 py-2 text-yellow-100 focus:outline-none focus:border-yellow-500"
                        onKeyDown={(e) => e.key === 'Enter' && submitManualAnswer()}
                    />
                    <button 
                        onClick={submitManualAnswer}
                        disabled={!manualAnswer || loading}
                        className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Submit
                    </button>
                </div>
            </div>
        )}

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
