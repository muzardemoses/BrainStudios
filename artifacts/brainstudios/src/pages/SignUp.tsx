import { SignUp as ClerkSignUp } from "@clerk/react";
import { Film } from "lucide-react";

export default function SignUp() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <div className="min-h-[100dvh] bg-background px-5 py-10 text-foreground">
      <div className="mx-auto grid min-h-[calc(100dvh-5rem)] max-w-6xl overflow-hidden border border-border bg-card lg:grid-cols-2">
        <section className="hidden border-r border-border bg-[radial-gradient(circle_at_70%_60%,rgba(255,139,34,0.2),transparent_34%),linear-gradient(145deg,#17151a,#0d0d11)] p-12 lg:flex lg:flex-col lg:justify-between">
          <Film size={36} className="text-primary" />
          <div>
            <p className="mb-4 font-mono text-xs font-bold tracking-[0.3em] text-primary">BRAINSTUDIOS / NEW DIRECTOR</p>
            <h1 className="max-w-md font-display text-6xl font-black leading-[0.92] tracking-tight">Start with a scene. Leave with a studio.</h1>
            <p className="mt-7 max-w-sm text-base leading-relaxed text-muted-foreground">Give your crew the first spark. They will make the plan, the frames, and the production logic visible.</p>
          </div>
          <p className="font-mono text-xs text-muted-foreground">The director remains in control.</p>
        </section>
        <section className="flex items-center justify-center p-6 sm:p-12">
          <ClerkSignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
        </section>
      </div>
    </div>
  );
}