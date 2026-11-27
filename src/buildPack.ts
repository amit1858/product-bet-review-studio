export const methodology = [
  ['Start with the problem', 'Name the people, their current workaround and the cost of the problem. Seek permissioned evidence that it matters; record what has not been validated.'],
  ['Choose tools deliberately', 'Compare UI complexity, domain logic, persistence, expected lifetime, audience and AI needs. Prefer the smallest stack that can meet them; record tradeoffs, not brand preferences.'],
  ['Write a buildable PRD', 'Specify goals, non-goals, workflow, functional requirements, risks and observable success signals. Separate proposed targets from demonstrated outcomes.'],
  ['Design flow and states', 'Map screens, transitions, empty/loading/error states, permissions, locks and recovery before writing the happy path.'],
  ['Build in small slices', 'Deliver one coherent user outcome at a time. Test with realistic fictional inputs, including missing evidence and failure cases.'],
  ['Review independently', 'Have a separate reviewer check product alignment, architecture, code quality, privacy, accessibility and responsive behavior against actual code and evidence.'],
  ['Review the review', 'Look for omitted screens, weak assertions, optimistic conclusions and untested assumptions. An Accept verdict is not proof that every state was inspected.'],
  ['Fix, record and reflect', 'Resolve must-fix findings, rerun affected checks and record limitations. Reflect on what changed before presenting; deployment needs a separate approval.'],
] as const;

export const buildSections = [
  {
    id: 'prd', title: 'PRD template', intro: 'Make the scope buildable before asking an agent to implement it.',
    text: `# Product requirements
Problem: [people, current workaround, cost; evidence and its limits]
Why now: [reason; unknowns to investigate]
Audience: [primary users; explicitly separate secondary intents]
Goals: [user outcomes, not a list of technologies]
Non-goals: [what this pass must not change]
Workflow: [starting state -> actions -> outputs -> human choice]
Functional requirements: [numbered, observable behavior]
State rules: [availability, invalidation, pending work, recovery]
Data and privacy: [what leaves the device; consent; lifetime; deletion]
Accessibility: [keyboard, focus, names, announcements, reduced motion]
Risks and tradeoffs: [provider failure, misleading claims, cost, scope]
Success signals: [what to observe; proposed targets are NOT results]
Acceptance criteria: [testable outcomes and relevant edge cases]
Verification: [unit, integration, browser, manual checks]
Release boundaries: [who approves; no deployment by implication]`,
  },
  {
    id: 'states', title: 'Screen and state checklist', intro: 'Design the edges as carefully as the happy path.',
    text: `- Landing: user problem, example labels, distinct learning actions.
- Material: empty, typed/pasted, optional evidence, text limits.
- Questions: interpretation correction, answered and unknown.
- Review: source-linked signals, limitations, no-evidence state.
- Decision: advisory recommendation versus human choice/rationale.
- Guides: static content, return/history, keyboard entry points.
- For every screen: loading, empty, failure, offline and retry.
- For every transition: availability, completion, upstream invalidation.
- Pending work: prevent duplicate submissions and destructive navigation.
- Permissions/transcripts: explicit start, accept/discard, fallback typing.
- Export: explicit intent, sensitive-content warning, failure recovery.
- Responsive/zoom: long content, mobile keyboard, no hidden controls.`,
  },
  {
    id: 'prompt', title: 'Build prompt for an AI coding agent', intro: 'A reusable starting prompt, not the private prompt or source of this app.',
    text: `Act as a product designer and full-stack engineer.
Build [product] for [audience] to address [problem].
Use the attached PRD as the scope; distinguish assumptions from evidence.

Before coding:
Inspect the existing repository, branch, working tree, architecture,
styles, tests and relevant documentation. Preserve newer work.
Explain a short plan and tool tradeoffs; propose dependencies before adding them.
Design the flow and empty, pending, error, permission and recovery states.

Implement in small, reviewable slices using existing patterns.
Keep user work and human decisions separate from AI suggestions.
Never invent research, validation, outcomes or measurements.
Use fictional fixtures and mocked providers; make no live paid calls.
Keep credentials out of code, fixtures, prompts, logs, screenshots and exports.
Keep private content session-first unless explicit consent is required by the PRD.
Preserve keyboard access, visible focus, accessible names and reduced motion.
Do not push, merge, deploy or change secrets/configuration without separate permission.

Verify acceptance criteria with the project's build/typecheck and relevant
unit, integration and browser tests. Inspect all screens, including lower
sections, at agreed mobile/desktop sizes and every theme.
Conduct an independent review, then review that review for blind spots.
Fix must-fix findings and rerun checks. Report evidence, files changed,
limitations and remaining manual checks. Do not claim production readiness
from automated tests alone.`,
  },
  {
    id: 'tests', title: 'Test and accessibility checklist', intro: 'Test the intended outcome, not just a click that happened to succeed.',
    text: `- Cover each acceptance criterion, failure boundary and recovery path.
- Use realistic fictional content, long input and missing evidence.
- Count/intercept provider requests; ensure demos/tours make none.
- Check keyboard-only entry, Back/Next/exit, disclosures and export.
- Check focus placement, visible outlines and full viewport visibility.
- Check names, current/completed/unavailable states and live announcements.
- Check text/control/focus contrast in every theme; document exemptions.
- Disable motion and confirm identical content and navigation.
- Check both draft fields survive errors; check upstream invalidation.
- Inspect every screen and lower section at mobile and desktop sizes.
- Separate automated evidence from real screen-reader/device testing.
- Record unavailable browsers and untested assumptions honestly.`,
  },
  {
    id: 'privacy', title: 'Privacy and credential-handling checklist', intro: 'Treat evidence capture as a data-handling operation.',
    text: `- Inventory data sent to each service and explain retention limits.
- No analytics, automatic sharing or automatic content persistence by default.
- Consent must name what is saved, where, for how long and how to delete it.
- Keep keys out of rendered text, browser storage, URLs and exports.
- Never put real credentials in source, fixtures, agent prompts or logs.
- Do not read/capture credentials during manual entry.
- Use isolated fictional browser sessions for screenshots.
- Never export authenticated state/traces; inspect safe artifacts before sharing.
- Keep guides/templates static and independent of live user content.
- Preserve the existing access gate for guides and downloads.
- Provide explicit clearing/cancellation; do not silently retry paid calls.`,
  },
  {
    id: 'readiness', title: 'Pre-production and deployment-readiness checklist', intro: 'A reviewable build and a release are different decisions.',
    text: `PRE-PRODUCTION
- Record branch, revision and exact uncommitted scope.
- Build/typecheck and relevant tests pass on the final changes.
- Independent and second-order reviews completed; must-fix findings resolved.
- Inspect final screenshots without private content or credentials.
- Record known limitations and outstanding manual checks.
- Human review approves the user experience and scope.

BEFORE A SEPARATELY AUTHORIZED DEPLOYMENT
- Confirm target environment, revision, access policy and owner.
- Inspect the existing deployment workflow; never guess a branch mapping.
- Complete required physical-device, screen-reader and cross-browser checks.
- Review provider/privacy policies, operating limits and failure monitoring.
- Protect secrets through approved secure channels, not this build pack.
- Plan health checks and approved rollback for the intended environment.
- Obtain explicit approval; pre-production acceptance is not deployment permission.
- Verify the deployed revision and critical journey; report without extra fixes.`,
  },
  {
    id: 'example', title: 'Fictional worked example', intro: 'Product Bet Review Studio as a methodology example, not validated research.',
    text: `PROBLEM
A fictional small product team has scattered notes about a grocery reorder
idea and wants to choose what to learn before committing to a new channel.
No customer research or benefit has been validated by this example.

TOOLS
A responsive, stateful interface with structured review logic and optional
AI benefits from a typed component UI and a server boundary for providers.
If only a static checklist were needed, a document would be simpler.
Persistence is optional and consent-based; a database is not assumed.

PRD / FLOW
Material -> Questions -> Review -> Decision.
Goals: surface uncertainty and record a human choice.
Non-goals: automatic research, invented evidence, automatic launch decisions.
States: no evidence, unknown answers, pending request, provider failure,
unaccepted transcript, edited upstream material and export recovery.

SMALL SLICES
Build a fictional no-provider example first; then typed material, structured
questions, source/limitation review and a human rationale. Add integrations
only behind explicit user actions and test with mocks.

REVIEW / REFLECTION
Inspect the whole review, not just its top. A badge squeezing a mobile title
can escape a first-screen screenshot. Add a layout regression and recheck.
Proposed success signal: users can explain the claim, its limitation and
their next learning choice. This has not been measured.
Decision: seek human pre-production review, not automatic deployment.`,
  },
] as const;

export const buildPackMarkdown = `# Build an app like this

A reusable methodology and build pack. Static educational content; no current
Studio material, credentials, decision, source code or deployment settings.

## Methodology

${methodology.map(([title, text], index) => `${index + 1}. **${title}.** ${text}`).join('\n\n')}

${buildSections.map(section => `## ${section.title}\n\n${section.intro}\n\n${section.text}`).join('\n\n')}
`;
