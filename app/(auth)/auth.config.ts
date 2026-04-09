import type { NextAuthConfig } from "next-auth";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const nextauthUrl = process.env.NEXTAUTH_URL;
const isSecureHost = (() => {
  if (!nextauthUrl) {
    return false;
  }

  try {
    const hostname = new URL(nextauthUrl).hostname;
    return (
      process.env.NODE_ENV === "production" || hostname.endsWith("devtunnels.ms")
    );
  } catch {
    return process.env.NODE_ENV === "production";
  }
})();

export const authConfig = {
  basePath: "/api/auth",
  trustHost: true,
  cookies: isSecureHost
    ? {
        sessionToken: {
          options: {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            domain: ".devtunnels.ms",
            secure: true,
          },
        },
      }
    : undefined,
  pages: {
    signIn: `${base}/login`,
    newUser: `${base}/`,
  },
  providers: [],
  callbacks: {},
} satisfies NextAuthConfig;
