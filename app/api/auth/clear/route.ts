import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export async function GET(request: Request) {
  await destroySession();
  return NextResponse.redirect(new URL("/login", request.url));
}
