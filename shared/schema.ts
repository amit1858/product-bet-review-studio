import { z } from 'zod';

export const decisions = ['proceed', 'test', 'reshape', 'stop'] as const;
export const decisionSchema = z.enum(decisions);
const short = z.string().trim().min(1).max(500);
const paragraph = z.string().trim().min(1).max(1200);
export const questionSchema = z.object({
  id: z.string().regex(/^Q[1-4]$/),
  question: short,
  why: short,
}).strict();
export const clarificationSchema = z.object({
  bet: paragraph,
  questions: z.array(questionSchema).max(4),
}).strict();
export const inputSchema = z.object({
  idea: z.string().trim().min(10, 'Describe your bet in at least 10 characters.').max(4000),
  context: z.string().trim().max(14000),
  understanding: z.string().trim().max(2000).optional(),
  answers: z.array(z.object({
    id: z.string().regex(/^Q[1-4]$/),
    question: short,
    answer: z.string().trim().max(2000),
  }).strict()).max(4).default([]),
}).strict().superRefine((input, ctx) => {
  if (new Set(input.answers.map(a => a.id)).size !== input.answers.length) {
    ctx.addIssue({ code: 'custom', message: 'Each question may have only one answer.', path: ['answers'] });
  }
});
export const reviewSchema = z.object({
  title: z.string().trim().min(1).max(120),
  bet: paragraph,
  evidence: z.array(z.object({
    claim: short,
    sourceId: z.string().regex(/^(S[12]|A[1-4])$/),
    quote: short,
    limitation: short,
  }).strict()).max(6),
  assumptions: z.array(z.object({
    claim: short,
    why: short,
    invalidatedBy: short,
  }).strict()).min(1).max(4),
  unknowns: z.array(z.object({ question: short, why: short }).strict()).max(4),
  challenge: z.object({
    title: short,
    why: paragraph,
    invalidatedBy: paragraph,
    sourceIds: z.array(z.string().regex(/^(S[12]|A[1-4])$/)).max(6),
  }).strict(),
  premortem: z.array(z.object({
    path: short,
    signal: short,
    mitigation: short,
  }).strict()).min(2).max(4),
  test: z.object({
    title: short,
    hypothesis: short,
    method: paragraph,
    success: short,
    stop: short,
    timebox: short,
    cost: short,
  }).strict(),
  recommendation: z.object({
    decision: decisionSchema,
    confidence: z.enum(['low', 'medium', 'high']),
    basis: paragraph,
    wouldChangeIf: paragraph,
  }).strict(),
  options: z.array(z.object({
    decision: decisionSchema,
    rationale: short,
  }).strict()).length(4),
}).strict();
export type Decision = z.infer<typeof decisionSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type Clarification = z.infer<typeof clarificationSchema>;
export type ReviewInput = z.infer<typeof inputSchema>;
export type Source = { id: string; label: string; text: string };

export function sourcesFor(input: ReviewInput): Source[] {
  return [
    { id: 'S1', label: 'Product bet', text: input.idea },
    ...(input.context ? [{ id: 'S2', label: 'Supporting material', text: input.context }] : []),
    ...input.answers.filter(a => a.answer).map(a => ({
      id: `A${a.id.slice(1)}`, label: `Answer to ${a.id}: ${a.question}`, text: a.answer,
    })),
  ];
}

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

export function validateReviewReferences(review: Review, sources: Source[]): void {
  for (const item of review.evidence) {
    const source = sources.find(s => s.id === item.sourceId);
    if (!source || !normalize(source.text).includes(normalize(item.quote))) {
      throw new Error('The review contains an unsupported evidence reference.');
    }
  }
  if (review.challenge.sourceIds.some(id => !sources.some(s => s.id === id))) {
    throw new Error('The challenge contains an unknown source reference.');
  }
  if (new Set(review.options.map(o => o.decision)).size !== 4) {
    throw new Error('The review must include each decision option exactly once.');
  }
}

export function leadershipStory(review: Review): { label: string; text: string }[] {
  const signal = review.evidence[0];
  return [
    { label: 'Signal', text: signal ? `"${signal.quote}" [${signal.sourceId}, user-supplied]` : 'No supporting evidence supplied. This is a hypothesis, not validation.' },
    { label: 'Tension', text: review.challenge.title },
    { label: 'What the evidence supports', text: signal ? signal.claim : 'No evidence-backed conclusion is available yet.' },
    { label: 'What it does not establish', text: signal ? signal.limitation : 'Demand, causality, feasibility, and outcomes have not been established by supplied evidence.' },
    { label: 'Implication', text: `Proposed next learning step: ${review.test.title}. ${review.test.hypothesis} This is a hypothesis to test, not a result.` },
    { label: 'Decision needed', text: 'Choose whether to proceed, test, reshape, or stop; record your rationale and conditions below. The agent recommendation is advisory.' },
  ];
}

export function decisionPack(
  review: Review, decision: Decision, rationale: string, sources: Source[], illustrative: boolean,
): string {
  return [
    `# ${review.title}`,
    illustrative ? '**ILLUSTRATIVE EXAMPLE - not live AI analysis or verified research.**' :
      '**AI-assisted review - user-supplied claims are not independently verified.**',
    '## Leadership story (drawn from this review, not new research)',
    ...leadershipStory(review).map(beat => `**${beat.label}:** ${beat.text}`),
    '## PM decision',
    `**${decision.toUpperCase()}**`,
    rationale.trim() || 'The PM has not recorded a rationale yet.',
    '## The bet',
    review.bet,
    '## Agent recommendation (advisory, not the PM decision)',
    `${review.recommendation.decision.toUpperCase()} | ${review.recommendation.confidence} confidence`,
    review.recommendation.basis,
    `Would change if: ${review.recommendation.wouldChangeIf}`,
    '## User-provided evidence (unverified)',
    ...(review.evidence.length ? review.evidence.map(e =>
      `- ${e.claim} [${e.sourceId}]\n  Quote: "${e.quote}"\n  Limitation: ${e.limitation}`) : ['No supporting evidence supplied.']),
    '## Assumptions',
    ...review.assumptions.map(a => `- ${a.claim}\n  Why it matters: ${a.why}\n  Invalidated by: ${a.invalidatedBy}`),
    '## Unknowns',
    ...(review.unknowns.length ? review.unknowns.map(u => `- ${u.question} ${u.why}`) : ['No additional unknowns identified; this is not proof of certainty.']),
    '## Strongest challenge',
    review.challenge.title, review.challenge.why,
    `Invalidated by: ${review.challenge.invalidatedBy}`,
    '## Pre-mortem',
    ...review.premortem.map(p => `- ${p.path}\n  Early signal: ${p.signal}\n  Mitigation: ${p.mitigation}`),
    '## Cheapest meaningful test (a proposal, not a result)',
    review.test.title,
    `Hypothesis: ${review.test.hypothesis}`,
    review.test.method,
    `Proposed success criterion: ${review.test.success}`,
    `Stop / reshape criterion: ${review.test.stop}`,
    `Timebox: ${review.test.timebox} | Estimated cost: ${review.test.cost}`,
    '## Source material supplied by the PM',
    ...sources.map(s => `### ${s.id}: ${s.label}\n${s.text}`),
  ].join('\n\n');
}
