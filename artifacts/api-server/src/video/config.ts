import { GoogleGenAI } from "@google/genai";
import { GoogleAuth } from "google-auth-library";
export const config = {
  project: process.env.GOOGLE_CLOUD_PROJECT || "",
  location: process.env.GOOGLE_CLOUD_LOCATION || "global",
  veoLocation:
    process.env.VEO_LOCATION ||
    (process.env.GOOGLE_CLOUD_LOCATION &&
    process.env.GOOGLE_CLOUD_LOCATION !== "global"
      ? process.env.GOOGLE_CLOUD_LOCATION
      : "us-central1"),
  gemini: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  veo: process.env.VEO_MODEL || "veo-3.1-fast-generate-001",
  image: process.env.IMAGE_MODEL || "gemini-2.5-flash-image",
  bucket: process.env.R2_BUCKET_NAME || "",
  endpoint:
    process.env.R2_ENDPOINT ||
    `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
};
export const googleAuth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  clientOptions: { quotaProjectId: process.env.GOOGLE_CLOUD_QUOTA_PROJECT },
});
export function google(video = false) {
  return new GoogleGenAI({
    vertexai: true,
    project: config.project,
    location: video ? config.veoLocation : config.location,
    googleAuthOptions: {
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      clientOptions: { quotaProjectId: process.env.GOOGLE_CLOUD_QUOTA_PROJECT },
    },
    httpOptions: { timeout: 120_000 },
  });
}
export function readiness() {
  const missing = [
    "DATABASE_URL",
    "CLERK_SECRET_KEY",
    "VITE_CLERK_PUBLISHABLE_KEY",
    "GOOGLE_CLOUD_PROJECT",
    "R2_BUCKET_NAME",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ].filter((k) => !process.env[k]);
  if (!process.env.R2_ENDPOINT && !process.env.R2_ACCOUNT_ID)
    missing.push("R2_ENDPOINT");
  return {
    ready: missing.length === 0,
    missing,
    models: { script: config.gemini, video: config.veo, image: config.image },
  };
}
export class WorkflowError extends Error {
  constructor(
    message: string,
    public status = 400,
    public retryable = false,
  ) {
    super(message);
  }
}
export function publicError(error: unknown): {
  message: string;
  retryable: boolean;
} {
  if (error instanceof WorkflowError)
    return { message: error.message, retryable: error.retryable };
  const e = error as {
    status?: number;
    code?: number | string;
    message?: string;
    $metadata?: { httpStatusCode?: number };
  };
  const status = Number(e?.status || e?.code || e?.$metadata?.httpStatusCode);
  const message = e?.message || "";
  if (status === 429 || /RESOURCE_EXHAUSTED|rate.limit/i.test(message))
    return {
      message: "The provider is at capacity. This job will retry with backoff.",
      retryable: true,
    };
  if (
    status === 401 ||
    /invalid_grant|default credentials|reauth/i.test(message)
  )
    return {
      message:
        "Google Cloud authentication needs attention. Refresh local Application Default Credentials and retry.",
      retryable: false,
    };
  if (/SERVICE_DISABLED/.test(message))
    return {
      message:
        "The Vertex AI API is disabled in the configured Google Cloud project. Enable aiplatform.googleapis.com, then retry.",
      retryable: false,
    };
  if (status === 403 || /PERMISSION_DENIED|AccessDenied/i.test(message))
    return {
      message:
        "The configured service account or credentials do not have permission for this operation. Check Google Cloud/R2 access and enabled APIs.",
      retryable: false,
    };
  if (status === 404)
    return {
      message:
        "The configured model or storage resource is unavailable. Check the model name and region, then retry.",
      retryable: false,
    };
  if (
    (status >= 500 && status <= 599) ||
    /ECONNRESET|ETIMEDOUT|ENOTFOUND|EADDRNOTAVAIL|fetch failed|timeout/i.test(
      message,
    )
  )
    return {
      message:
        "A service connection was interrupted. Completed work is safe; the job will retry.",
      retryable: true,
    };
  return {
    message:
      "This production step could not finish. Completed assets are safe. Please retry or adjust the scene prompt.",
    retryable: false,
  };
}
