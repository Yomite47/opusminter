import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        
        // Use a high-quality RPC if available in env, otherwise fallback to public
        // Ideally, user should add SOLANA_RPC_URL to their .env file (e.g. Helius, Alchemy)
        const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

        const res = await fetch(RPC_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Add authentication headers if using a premium RPC that requires them (e.g. Helius)
                // 'Authorization': `Bearer ${process.env.RPC_KEY}` 
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const text = await res.text();
            return NextResponse.json(
                { error: `RPC Error: ${res.status} ${res.statusText}`, details: text },
                { status: res.status }
            );
        }

        const data = await res.json();
        return NextResponse.json(data);

    } catch (error: any) {
        console.error("RPC Proxy Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
