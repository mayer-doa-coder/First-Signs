# First Signs

First Signs is a Bangladesh-wide, bilingual TB screening and care-navigation prototype. It helps people understand the next safe step and find formal TB services. It does not diagnose TB or replace clinical assessment.

## Start here

- **For people using the website:** start from the home page, choose a self-use or pharmacy-assisted screening, and follow the next-step guidance.
- **For a project overview:** read [PRD.md](PRD.md). It defines the product behaviour and safety boundaries.
- **For the full journey:** read [WORKFLOW_GUIDE.md](WORKFLOW_GUIDE.md). It explains each patient, pharmacy, TB-centre, government, and messaging scenario in plain language.
- **For implementation details:** read [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md).

## Project map

| Place | What it contains |
| --- | --- |
| `app/` | Website pages and server endpoints. |
| `components/` | Reusable screens and interface pieces. |
| `lib/` | Shared rules, bilingual content, data helpers, and safety logic. |
| `supabase/` | Database migrations and access rules. |
| `hear-service/` | Optional local audio-analysis service. |
| `scripts/` | Repeatable checks for flows and safety rules. |
| `public/` | Static website assets. |

## Run locally

1. Copy `.env.example` to `.env.local` and enter the local configuration values. Do not commit `.env.local`.
2. Install packages with `npm install`.
3. Start the website with `npm run dev`.
4. Open the local address printed by Next.js.

## Useful checks

- `npm run lint` checks code quality.
- `npx tsc --noEmit` checks TypeScript.
- `npm run build` verifies the production build.
- `npm run test:safety` checks the fixed screening safety rules.
- `npm run test:integration` checks the deterministic end-to-end demo journey.

## Deploy on Render

The included [`render.yaml`](render.yaml) creates a Node web service that builds with `npm ci && npm run build`, starts Next.js on Render's assigned port, and deploys after commits to the connected branch. It intentionally prompts for configuration rather than storing credentials in Git.

Before enabling public sign-ups, set the Render environment variables from `.env.example`, using the same Supabase project that has the repository migrations applied. Set both `APP_URL` and `NEXT_PUBLIC_APP_URL` to the final HTTPS Render or custom-domain origin, then redeploy so the browser bundle receives the public value.

In Supabase Auth, add these Redirect URLs:

- `https://<your-render-host>/auth/callback`
- `https://<your-custom-domain>/auth/callback` when using a custom domain

Set the Auth Site URL to the final public origin. Replace the Reset Password email template with [`supabase/templates/recovery.html`](supabase/templates/recovery.html) so the six-digit recovery-code form works, and configure production SMTP before relying on confirmation, recovery, or invitation email delivery. Add the optional AI, reminder-email, Telegram, and HeAR variables only when those integrations are enabled; otherwise they stay disabled.

Render deploys application code, not Supabase migrations. The current authentication migration has already been applied to the connected Supabase project. Apply and verify any future migration before deploying code that depends on it.

## Important health and privacy boundaries

- English opens first; Bangla is available throughout the patient experience.
- The fixed symptom rules determine safety guidance. AI and audio signals cannot change it.
- The website may recommend formal evaluation, but never diagnoses TB.
- Patient identity and private care details must not appear in pharmacy, government, or public views.
- Raw cough audio and audio embeddings are not retained by the documented flow.

## Keeping the project understandable

Before changing behaviour, check `PRD.md`. If a requirement is unclear or conflicts with another document, resolve that first. Keep public health language plain, preserve the English/Bangla pairing, and run the relevant checks after each change.
