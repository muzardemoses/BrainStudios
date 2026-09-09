import { SignIn, SignUp } from "@clerk/react";
import { AudioLines, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { authEnabled } from "@/lib/auth";
export default function AuthPage({ signUp = false }: { signUp?: boolean }) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <div className="auth-page">
      <Link href="/" className="brand">
        <span className="brand-mark">
          <AudioLines size={24} />
        </span>
        brainstudios.
      </Link>
      <div className="auth-content">
        <h1>
          {signUp
            ? "Your next great video starts here."
            : "Your next idea is waiting."}
        </h1>
        <p>From the first spark to the final frame.</p>
        {authEnabled ? (
          signUp ? (
            <SignUp
              fallbackRedirectUrl={`${base}/`}
              routing="path"
              path={`${base}/sign-up`}
              signInUrl={`${base}/sign-in`}
            />
          ) : (
            <SignIn
              fallbackRedirectUrl={`${base}/`}
              routing="path"
              path={`${base}/sign-in`}
              signUpUrl={`${base}/sign-up`}
            />
          )
        ) : (
          <div className="auth-demo">
            <p>
              This workspace is running in local demo mode. Authentication will
              be available when a Clerk publishable key is configured.
            </p>
            <Link className="button primary" href="/">
              Explore the studio
              <ArrowRight size={15} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
