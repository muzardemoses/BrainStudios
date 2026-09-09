# BrainStudios

BrainStudios is a conversational agentic video-production assistant.

Workflow: Prompt → Timed Script → Scene Plan → Generated Scenes → Video Assembly → Thumbnail → Publishing Details.

The existing light studio design is preserved. New authenticated productions use Clerk, Postgres, Google ADK/Gemini, asynchronous Veo, private Cloudflare R2 storage, FFmpeg assembly, generated thumbnails, and editable publishing metadata. The nature sample remains a browser-local demo. YouTube upload and spoken voiceover are not implemented.

Read README.md for setup, architecture, service configuration, migrations, and checks. The API defaults to port 5001 and runs durable job workers; the Vite frontend defaults to 5173 and proxies /api. Root .env is loaded by both; only VITE-prefixed values reach the browser. Google uses ADC.

Apply only the additive video workflow migration with `pnpm --filter @workspace/api-server db:migrate`. Preserve existing database data. The legacy movie API router is no longer mounted.
