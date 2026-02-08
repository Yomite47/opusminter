
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { url, method = 'GET', headers = {}, body } = await req.json();

    if (!url) {
        return NextResponse.json({ error: "Missing URL" }, { status: 400 });
    }

    console.log(`[Proxy] ${method} ${url}`);

    const response = await fetch(url, {
      method,
      headers: {
        ...headers,
        // Avoid host header conflicts
        host: undefined,
        origin: undefined,
        referer: undefined,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.text();
    
    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (error: any) {
    console.error("[Proxy Error]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
