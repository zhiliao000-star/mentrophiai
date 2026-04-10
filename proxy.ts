import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getSupabasePublicEnv } from "./lib/supabase/env";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { supabaseUrl, supabaseAnonKey } = getSupabasePublicEnv();

  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({
          request,
        });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options as CookieOptions);
        }
      },
    },
  });

  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (pathname.startsWith("/api/")) {
    return response;
  }

  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const publicPaths = new Set(["/login", "/register", "/auth/callback"]);
  const isPublicPath = publicPaths.has(pathname);

  if (!user && !isPublicPath) {
    const redirectUrl = encodeURIComponent(
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    );

    return NextResponse.redirect(
      new URL(`${base}/login?next=${redirectUrl}`, request.url)
    );
  }

  if (user && isPublicPath) {
    return NextResponse.redirect(new URL(`${base}/`, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/chat/:id",
    "/api/:path*",
    "/login",
    "/register",

    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
