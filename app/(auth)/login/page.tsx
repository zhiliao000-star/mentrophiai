import { GoogleOAuthCard } from "@/components/auth/google-oauth-card";

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="text-sm text-muted-foreground">
        Sign in with Google to continue with a persistent account.
      </p>
      <GoogleOAuthCard />
    </>
  );
}
