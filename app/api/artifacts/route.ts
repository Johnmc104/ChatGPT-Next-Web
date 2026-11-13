import md5 from "spark-md5";
import { NextRequest, NextResponse } from "next/server";
import { getServerSideConfig } from "@/app/config/server";
import { logger } from "@/app/utils/logger";
import { ModelProvider } from "@/app/constant";
import { auth } from "../auth";

async function handle(
  req: NextRequest,
  _context: { params: Promise<Record<string, never>> },
) {
  const serverConfig = getServerSideConfig();
  const storeUrl = () =>
    `https://api.cloudflare.com/client/v4/accounts/${serverConfig.cloudflareAccountId}/storage/kv/namespaces/${serverConfig.cloudflareKVNamespaceId}`;
  const storeHeaders = () => ({
    Authorization: `Bearer ${serverConfig.cloudflareKVApiKey}`,
  });
  if (req.method === "POST") {
    // Saving is restricted to authorized users: artifacts are rendered as
    // HTML under this domain. Reading stays public so share links work.
    const authResult = await auth(req, ModelProvider.GPT);
    if (authResult.error) {
      return NextResponse.json(
        { error: true, code: authResult.code },
        { status: 401 },
      );
    }
    const clonedBody = await req.text();
    const hashedCode = md5.hash(clonedBody).trim();
    const body: {
      key: string;
      value: string;
      expiration_ttl?: number;
    } = {
      key: hashedCode,
      value: clonedBody,
    };
    try {
      const ttl = parseInt(serverConfig.cloudflareKVTTL as string);
      if (ttl > 60) {
        body["expiration_ttl"] = ttl;
      }
    } catch (e) {
      logger.error("[Artifacts]", e);
    }
    const res = await fetch(`${storeUrl()}/bulk`, {
      headers: {
        ...storeHeaders(),
        "Content-Type": "application/json",
      },
      method: "PUT",
      body: JSON.stringify([body]),
    });
    const result = await res.json();
    logger.debug("[Artifacts] save data", result);
    if (result?.success) {
      return NextResponse.json(
        { code: 0, id: hashedCode, result },
        { status: res.status },
      );
    }
    return NextResponse.json(
      { error: true, msg: "Save data error" },
      { status: 400 },
    );
  }
  if (req.method === "GET") {
    const id = req?.nextUrl?.searchParams?.get("id");
    const res = await fetch(`${storeUrl()}/values/${id}`, {
      headers: storeHeaders(),
      method: "GET",
    });
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  }
  return NextResponse.json(
    { error: true, msg: "Invalid request" },
    { status: 400 },
  );
}

export const POST = handle;
export const GET = handle;

export const runtime = "edge";
