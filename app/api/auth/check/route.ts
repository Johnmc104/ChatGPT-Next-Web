import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../auth";
import { ModelProvider } from "../../../constant";

export async function POST(request: NextRequest) {
  try {
    const result = await auth(request, ModelProvider.GPT);
    if (result.error) {
      return NextResponse.json(
        { ok: false, code: result.code ?? "server" },
        {
          status:
            result.code === "missing-server-key"
              ? 503
              : result.code === "user-key-disabled"
              ? 403
              : 401,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
    // Never serialize AuthResult: it can contain a server API key.
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, code: "server" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export const runtime = "edge";
