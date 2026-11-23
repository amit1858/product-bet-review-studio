import test from 'node:test';
import assert from 'node:assert/strict';
import { clarificationSchema, decisionPack, inputSchema, leadershipStory, reviewSchema, sourcesFor, validateReviewReferences } from '../shared/schema';
import { speechChunks } from '../src/audio';
import { sampleClarification } from '../src/sample';
import { cloneReview, input } from './fixtures';

test('provided evidence is source-linked; invented or wrong-source quotes are rejected', () => {
  const review = reviewSchema.parse(cloneReview());
  const sources = sourcesFor(input);
  assert.doesNotThrow(() => validateReviewReferences(review, sources));
  review.evidence[0].quote = '97% of customers love the product.';
  assert.throws(() => validateReviewReferences(review, sources), /unsupported/);
  review.evidence[0] = cloneReview().evidence[0];
  review.evidence[0].sourceId = 'A1';
  assert.throws(() => validateReviewReferences(review, sources), /unsupported/);
});

test('empty evidence is allowed; invented challenge sources and duplicate decisions are not', () => {
  const review = cloneReview(); review.evidence = []; review.challenge.sourceIds = [];
  assert.doesNotThrow(() => validateReviewReferences(review, sourcesFor(input)));
  review.challenge.sourceIds = ['A4'];
  assert.throws(() => validateReviewReferences(review, sourcesFor(input)), /unknown source/);
  review.challenge.sourceIds = [];
  review.options[3].decision = 'proceed';
  assert.throws(() => validateReviewReferences(review, sourcesFor(input)), /exactly once/);
});

test('at most four clarifications; empty bets and duplicate answer IDs are rejected', () => {
  assert.equal(clarificationSchema.parse(sampleClarification).questions.length, 3);
  assert.equal(clarificationSchema.safeParse({ ...sampleClarification, questions: Array(5).fill(sampleClarification.questions[0]) }).success, false);
  assert.equal(inputSchema.safeParse({ ...input, idea: ' ' }).success, false);
  assert.equal(inputSchema.safeParse({ ...input, answers: Array(2).fill({ id: 'Q1', question: 'Why?', answer: '' }) }).success, false);
  assert.deepEqual(sourcesFor({ ...input, answers: [{ id: 'Q1', question: 'Why?', answer: '' }] }).map(s => s.id), ['S1', 'S2']);
});

test('decision pack preserves a PM disagreement, rationale and source material without rewriting them', () => {
  const pack = decisionPack(cloneReview(), 'stop', 'We cannot staff this pilot. Reconsider next quarter.', sourcesFor(input), true);
  const human = pack.split('## PM decision')[1].split('## The bet')[0];
  assert.match(human, /\*\*STOP\*\*/);
  assert.match(human, /We cannot staff this pilot/);
  assert.match(pack, /Agent recommendation \(advisory, not the PM decision\)[\s\S]*TEST/);
  assert.match(pack, /ILLUSTRATIVE EXAMPLE/);
  assert.ok(pack.includes(input.context));
});

test('leadership story uses supplied quotations and their limitations without inventing validation', () => {
  const review = cloneReview();
  const beats = leadershipStory(review);
  assert.ok(beats[0].text.includes(review.evidence[0].quote));
  assert.ok(beats[0].text.includes(review.evidence[0].sourceId));
  assert.equal(beats[2].text, review.evidence[0].claim);
  assert.equal(beats[3].text, review.evidence[0].limitation);
  assert.ok(beats[4].text.includes(review.test.hypothesis));
  assert.match(beats[4].text, /not a result/);
  const pack = decisionPack(review, 'stop', 'No staffing capacity.', sourcesFor(input), false);
  for (const beat of beats) assert.ok(pack.includes(beat.text));
  review.evidence = [];
  const unsupported = leadershipStory(review).map(beat => beat.text).join('\n');
  assert.match(unsupported, /No supporting evidence/);
  assert.match(unsupported, /No evidence-backed conclusion/);
  assert.ok(!unsupported.includes(beats[0].text));
});

test('speech chunks respect API limits and preserve mixed-language text and surrogate pairs', () => {
  const text = ('English बात करें 🧪. Another useful question.\n').repeat(250);
  const chunks = speechChunks(text);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(c => c.length <= 2400 && !/[\uD800-\uDBFF]$/.test(c)));
  assert.equal(chunks.join(' ').replace(/\s+/g, ''), text.replace(/\s+/g, ''));
});
