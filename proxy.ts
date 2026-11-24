import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: the board pages validate the session with cloudhike Auth.
export function proxy(request: NextRequest) {
  if (!request.cookies.get("jb_session")?.value) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/board/:path*"] };
