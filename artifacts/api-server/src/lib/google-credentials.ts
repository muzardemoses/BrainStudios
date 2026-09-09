import { chmod, open, rm } from "node:fs/promises";

const runtimeCredentialsPath = "/tmp/google-service-account.json";

/**
 * Materialize the Replit JSON secret only for the lifetime of this runtime.
 * When the secret is absent, this deliberately leaves ADC resolution untouched.
 */
export async function configureGoogleApplicationCredentials(): Promise<void> {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credentialsJson) return;

  try {
    const parsed = JSON.parse(credentialsJson) as Record<string, unknown>;
    if (
      parsed.type !== "service_account" ||
      typeof parsed.client_email !== "string" ||
      typeof parsed.private_key !== "string"
    ) {
      throw new Error("Unexpected credential shape");
    }
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON is not valid Google service-account JSON.",
    );
  }

  const file = await open(runtimeCredentialsPath, "w", 0o600);
  try {
    await file.writeFile(credentialsJson, { encoding: "utf8" });
  } catch (error) {
    await rm(runtimeCredentialsPath, { force: true }).catch(() => {});
    throw error;
  } finally {
    await file.close();
  }

  // `mode` only applies when a file is created; enforce it for an existing path.
  await chmod(runtimeCredentialsPath, 0o600);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = runtimeCredentialsPath;
}