import { lookupAccessHandler } from "@/utils/lookupAccessHttp";
export const runtime = "nodejs";
export const POST = req => lookupAccessHandler(req, "verify");
