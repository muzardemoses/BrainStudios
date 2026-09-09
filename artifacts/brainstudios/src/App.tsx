import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider } from "@clerk/react";
import { clerkKey } from "@/lib/auth";
import { Route, Switch, Router } from "wouter";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { ProductionApiProvider } from "@/components/ProductionApi";
import Studio from "@/pages/Studio";
import SignIn from "@/pages/SignIn";
import SignUp from "@/pages/SignUp";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
function AuthProvider({ children }: { children: ReactNode }) {
  return clerkKey ? (
    <ClerkProvider
      publishableKey={clerkKey}
      proxyUrl={import.meta.env.VITE_CLERK_PROXY_URL}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      appearance={{
        variables: { colorPrimary: "#de643e", fontFamily: "Inter, sans-serif" },
      }}
    >
      {children}
    </ClerkProvider>
  ) : (
    children
  );
}
export default function App() {
  return (
    <Router base={basePath}>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <ProductionApiProvider>
            <TooltipProvider>
              <Switch>
                <Route path="/" component={Studio} />
                <Route path="/sign-in" component={SignIn} />
                <Route path="/sign-in/:rest*" component={SignIn} />
                <Route path="/sign-up" component={SignUp} />
                <Route path="/sign-up/:rest*" component={SignUp} />
                <Route component={NotFound} />
              </Switch>
              <Toaster />
            </TooltipProvider>
          </ProductionApiProvider>
        </QueryClientProvider>
      </AuthProvider>
    </Router>
  );
}
