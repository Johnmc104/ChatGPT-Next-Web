import { ModelProvider } from "@/app/constant";
import { prettyObject } from "@/app/utils/format";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "./auth";
import { requestOpenai } from "./common";
import { logger } from "@/app/utils/logger";

export async function handle(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  logger.debug("[Azure Route] params", params);

  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }

  const subpath = params.path.join("/");

  const authResult = auth(req, ModelProvider.GPT);
  if (authResult.error) {
    return NextResponse.json(authResult, {
      status: 401,
    });
  }

  try {
    return await requestOpenai(req, authResult);
  } catch (e) {
    logger.error("[Azure]", e);
    return NextResponse.json(prettyObject(e));
  }
}
