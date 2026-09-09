import { publishableKeyFromHost } from "@clerk/react/internal";
export const clerkKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
export const authEnabled = Boolean(clerkKey);
