/**
 * Proxy POST /api/scan to FastAPI Backend
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://backend:8000";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    // if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    
    const response = await fetch(`${BACKEND_URL}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    
    // If backend returns 202 Accepted, we return it to the frontend
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[Proxy] POST /api/scan error:", error);
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/scan`);
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}
