import { configureGoogleApplicationCredentials } from "../src/lib/google-credentials";

await configureGoogleApplicationCredentials();

const [{ GoogleAuth }] = await Promise.all([import("google-auth-library")]);

const project = process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || "global";
if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is required.");

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  clientOptions: { quotaProjectId: process.env.GOOGLE_CLOUD_QUOTA_PROJECT },
});

const client = await auth.getClient();
await client.getAccessToken();

const host =
  location === "global"
    ? "aiplatform.googleapis.com"
    : `${location}-aiplatform.googleapis.com`;
await auth.request({
  url: `https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}`,
  method: "GET",
});

console.log(
  "PASS: Application Default Credentials authenticated with the Vertex AI API.",
);