# Project Working Instructions

## Sources of truth

1. `PRD.md` defines product requirements and takes precedence.
2. `IMPLEMENTATION_GUIDE.md` provides implementation guidance.
3. Do not invent product requirements.
4. If these documents conflict, or an important requirement is unclear, stop and explain the issue before changing product behavior. Do not guess or silently resolve it.

## Development scope and approach

- Work only on the requested feature and closely required supporting work.
- Do not remove or rewrite working features unless the requested work requires it.
- Prefer simple, maintainable solutions; avoid unnecessary architecture.
- Do not add dependencies unless they are genuinely needed.
- Keep patient-facing screens simple and mobile-friendly.
- Implement English and Bangla on every user-facing screen from the start. English is the default and primary language; Bangla is secondary and must remain available through the persistent language toggle.
- Use clear, easy-to-understand language and preserve the meaning of safety-critical content in both Bangla and English.
- Enforce global typography: use Noto Sans Bengali for all Bangla text and Merriweather for all English text. Do not introduce any other font family without explicit approval.
- Apply the typography system to every interface state, including forms, dashboards, validation, alerts, loading states, errors, modals, toasts, and application-controlled map labels. Mixed-language content must apply the correct font to each language.
- Keep important health information highly readable; do not use light font weights.
- Never print secrets.
- Never commit `.env` files.
- Never hard-code API keys.
- Use environment variables.
- Never commit or push to Git.

## Safety, privacy, and incentives

- Never present the system as diagnosing TB.
- AI must never override fixed safety rules.
- Never expose private patient information in public or government views.
- Keep self-use and pharmacy-assisted flows separate wherever incentives are involved.
- Apply pharmacy rewards only to pharmacy-assisted cases.
- Describe government hotspot signals as investigation signals, never as confirmed outbreaks.

## Design system

Primary design language: restrained Claymorphism.

The verified visual and interaction reference is `https://letters.app/` (also documented at `https://www.awwwards.com/sites/letters#elements`). Reuse its observable component patterns consistently across the product: a pale-blue rounded shell, high-contrast white navigation, oversized centered hero copy, black pill primary actions, soft-gray bento cards, compact labels, generous whitespace, and restrained floating/reveal motion. Do not copy proprietary source code, branding, medical content, or unavailable assets; build the verified patterns with project-owned HTML/CSS and the approved typography.

The UI must feel:

- clean
- friendly
- trustworthy
- modern
- healthcare-appropriate
- mobile-first

Clay effects should be used mainly for cards, important buttons, major panels, and status surfaces. Use Claymorphism strongly on visualizations while keeping data and health information clear and readable.

Avoid excessive 3D depth, oversized shadows, low contrast, decorative clutter, and childish styling. Use reusable global design tokens and components rather than page-specific duplicated styling.

Themes, component libraries, and packages must not replace the approved fonts: Noto Sans Bengali for Bangla and Merriweather for English.

## Quality checks

After implementing a feature:

1. Run the application.
2. Run relevant tests.
3. Test success cases.
4. Test failure cases.
5. Test mobile behavior when relevant.
6. Test English as the default and Bangla as the secondary language for changed user-facing content.
7. Test that Bangla and English text use their required fonts, including mixed-language content and all changed UI states.
8. Check that existing flows still work.
9. Report exactly what changed.
10. Report anything not implemented or mocked.
11. Do not claim a feature works unless it was actually tested.

## Required completion report

Before finishing a task, report:

- Files changed.
- Feature implemented.
- Tests performed.
- Known limitations.
- Anything still mocked.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
