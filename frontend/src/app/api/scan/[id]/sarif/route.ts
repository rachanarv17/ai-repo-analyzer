/**
 * Proxy GET /api/scan/[id]/sarif to FastAPI Backend
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://backend:8000";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    const response = await fetch(`${BACKEND_URL}/scan/${id}/sarif`);
    const data = await response.json();
    
    return new NextResponse(JSON.stringify(data, null, 2), {
      status: response.status,
      headers: {
        "Content-Type": "application/sarif+json",
        "Content-Disposition": `attachment; filename="scan-${id}.sarif"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}
