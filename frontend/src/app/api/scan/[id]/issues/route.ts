/**
 * Proxy GET /api/scan/[id]/issues to FastAPI Backend
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://backend:8000";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const searchParams = req.nextUrl.searchParams;
  
  try {
    const response = await fetch(`${BACKEND_URL}/scan/${id}/issues?${searchParams.toString()}`);
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[Proxy] GET issues error:", error);
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}
