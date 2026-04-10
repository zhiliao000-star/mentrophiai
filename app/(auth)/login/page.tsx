import { Suspense } from "react";
import { GoogleOAuthCard } from "@/components/auth/google-oauth-card";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <GoogleOAuthCard />
    </Suspense>
  );
}
