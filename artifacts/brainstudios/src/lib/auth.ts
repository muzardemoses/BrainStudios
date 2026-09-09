import { publishableKeyFromHost } from "@clerk/react/internal";
const configuredKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const managedHost = /\.(replit\.dev|replit\.app|repl\.co)$/.test(
  window.location.hostname,
);
// Preserve Replit-managed authentication; local demo mode needs no credentials.
export const clerkKey =
  configuredKey ||
  (managedHost ? publishableKeyFromHost(window.location.hostname) : undefined);
export const authEnabled = Boolean(clerkKey);
