import { configureGoogleApplicationCredentials } from "./lib/google-credentials";

await configureGoogleApplicationCredentials();
await import("./index");