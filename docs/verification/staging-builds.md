# Staging deployment setup — 2026-10-20

The owner authorized automatic deployment from `develop` to staging and an immediate deployment of the latest product layout changes.

- Source: `c937751`, including product layout commit `66d381f`.
- Local verification: formatting, `npm run build:staging`, and `npx wrangler deploy --dry-run` passed. The generated configuration selected `veganalts-staging`, its staging D1 database, and staging R2 bucket.
- Immediate deployment: `npx wrangler deploy --keep-vars` published Worker version `672fbfea-dafa-4b8f-8ab3-9215850eea84` to `staging.veganalts.com`.
- Live verification: `/healthz` returned `{"status":"ok"}`. Chrome confirmed branded product names, six popular footer aisles with the full-directory link, one Ratings panel containing community and personal ratings, available photo thumbnails, and community notes last.
- Cloudflare Workers Builds: `Chaseos/VeganAlts`, branch `develop`, root `/`, build `npm run build:staging`, deploy `npx wrangler deploy --keep-vars`, preview builds disabled. The Git connection warning cleared after the GitHub connection was refreshed. Existing runtime secrets and the current staging administrator were retained.

This record's push exercises the first automatic build after connecting the repository. Its build and deployment outcome is checked in the staging Worker's Cloudflare deployment history before completing setup. Production, D1 schema and stored media are outside this change.
