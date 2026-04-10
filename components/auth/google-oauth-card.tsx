"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SupabaseUser = {
  id: string;
  email?: string | null;
};

export function GoogleOAuthCard() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (mounted) {
        setUser(data.user ? { id: data.user.id, email: data.user.email } : null);
        setLoading(false);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(
          session?.user
            ? { id: session.user.id, email: session.user.email }
            : null
        );
      }
    );

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function loginWithGoogle() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/login`,
      },
    });
    if (error) {
      setBusy(false);
      throw error;
    }
  }

  async function logout() {
    setBusy(true);
    await supabase.auth.signOut();
    setBusy(false);
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/80 p-5 shadow-[var(--shadow-card)]">
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-4 w-56 animate-pulse rounded bg-muted/70" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card/90 p-5 shadow-[var(--shadow-card)] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            {user ? "Signed in" : "Continue with Google"}
          </p>
          <p className="text-xs text-muted-foreground">
            {user ? user.email ?? user.id : "Use Google OAuth to sign in."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {user ? (
            <Button
              className="rounded-full"
              disabled={busy}
              onClick={logout}
              variant="secondary"
            >
              Logout
            </Button>
          ) : (
            <Button
              className={cn("rounded-full bg-foreground text-background")}
              disabled={busy}
              onClick={loginWithGoogle}
            >
              Login with Google
            </Button>
          )}
        </div>
      </div>
      {user && (
        <div className="mt-4 rounded-xl bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground">
          user.id: <span className="font-mono text-foreground">{user.id}</span>
        </div>
      )}
    </div>
  );
}
