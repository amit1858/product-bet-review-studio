import type { Clarification, Review } from '../shared/schema';

export const sampleIdea = 'Add a WhatsApp reorder assistant for independent grocery stores so busy shoppers can repeat their weekly basket without opening our app.';
export const sampleContext = `Fictional scenario for demonstration, not real customer research.

Customer notes: 6 of 8 shoppers interviewed said rebuilding their weekly basket takes too long. One said: "I just want last week's order, with a few changes."

Product metrics: 42% of first-time shoppers placed a second order within 30 days. We have not measured why the other shoppers did not return.

Operations notes: Store owners already receive some orders on WhatsApp. Catalog prices and stock are updated manually.

Constraint: A two-person team has two weeks to test the idea. We cannot build a new inventory integration this month.`;

export const sampleClarification: Clarification = {
  bet: 'Help existing grocery shoppers repeat a basket through WhatsApp, aiming to improve second-order conversion without introducing a new inventory integration.',
  questions: [
    { id: 'Q1', question: 'Is rebuilding the basket the reason shoppers do not return, or only a complaint from people who already do?', why: 'A convenience complaint is not yet evidence of a retention problem.' },
    { id: 'Q2', question: 'How would the store confirm current prices and unavailable items before a shopper pays?', why: 'The proposed channel inherits an inventory and trust risk.' },
    { id: 'Q3', question: 'What improvement would justify building this, and what result would make you stop?', why: 'Agree on the decision threshold before seeing the test results.' },
  ],
};

export const sampleReview: Review = {
  title: 'A shorter path to the second basket',
  bet: sampleClarification.bet,
  evidence: [
    { claim: 'Repeat-basket friction appears in a small interview sample.', sourceId: 'S2', quote: '6 of 8 shoppers interviewed said rebuilding their weekly basket takes too long.', limitation: 'Small, possibly biased sample. Complaints do not establish why shoppers churn.' },
    { claim: 'There is room to improve second-order conversion.', sourceId: 'S2', quote: '42% of first-time shoppers placed a second order within 30 days.', limitation: 'No baseline segmentation or causal explanation is supplied.' },
    { claim: 'Stores already use the proposed channel.', sourceId: 'S2', quote: 'Store owners already receive some orders on WhatsApp.', limitation: 'Some existing usage does not establish capacity or sustainable economics.' },
  ],
  assumptions: [
    { claim: 'Basket friction, rather than price or availability, prevents repeat orders.', why: 'Reducing steps only helps if steps are the binding constraint.', invalidatedBy: 'Lapsed shoppers cite poor availability or price, and decline a one-tap repeat offer.' },
    { claim: 'Manual confirmation can deliver a trustworthy experience.', why: 'An easy order with incorrect stock can damage trust more than a slower one.', invalidatedBy: 'Store staff cannot confirm the basket reliably within the promised window.' },
  ],
  unknowns: [
    { question: 'Why do non-returning shoppers leave?', why: 'The interview sample may mostly describe existing repeat shoppers.' },
    { question: 'What is the staff cost per completed reorder?', why: 'A working concierge test is not evidence that automation will be profitable.' },
  ],
  challenge: {
    title: 'You may be solving a repeat shopper’s inconvenience—not a lost shopper’s reason to leave.',
    why: 'The retention metric and interview complaints sit next to each other, but do not establish a causal link. Building a new channel now would bet on that unproven connection.',
    invalidatedBy: 'If lapsed shoppers reject a manually prepared repeat basket because of price, stock, or trust, a faster ordering channel is unlikely to solve the core problem.',
    sourceIds: ['S2'],
  },
  premortem: [
    { path: 'The basket is easy. The items are unavailable.', signal: 'Frequent substitutions or cancelled orders during the pilot.', mitigation: 'Confirm stock and total price before collecting payment; track every substitution.' },
    { path: 'The pilot works only because a PM runs it.', signal: 'Staff time per order exceeds the agreed operating budget.', mitigation: 'Let store staff run the second week and measure handling time.' },
    { path: 'Happy repeat shoppers dominate the results.', signal: 'Pilot adoption is strong but lapsed shoppers still do not return.', mitigation: 'Separate recent-repeat and lapsed-shopper cohorts before interpreting results.' },
  ],
  test: {
    title: 'Concierge reorder, before a single integration',
    hypothesis: 'A prepared, stock-confirmed basket helps lapsed shoppers place a second order.',
    method: 'With consent, invite 20 lapsed shoppers from one store. Manually prepare their previous basket, confirm stock, and send a WhatsApp reorder offer. Interview non-buyers. Compare directionally with a similar, untreated group; a small pilot is not statistical proof.',
    success: 'Proposed, PM-editable threshold: at least 6 of 20 invited shoppers reorder, with median staff handling under 5 minutes.',
    stop: 'Fewer than 3 reorders, or price / availability dominates non-buyer feedback. Reshape around the actual barrier.',
    timebox: '10 working days',
    cost: 'Two people; manual workflow; no inventory build. Estimate, not a measured cost.',
  },
  recommendation: {
    decision: 'test',
    confidence: 'medium',
    basis: 'There is a plausible problem and an inexpensive way to challenge it. Current evidence does not connect basket friction to retention strongly enough to justify a full build.',
    wouldChangeIf: 'Proceed becomes more defensible if lapsed shoppers respond and staff can fulfill accurately at a sustainable cost. Reshape if price or stock is the stronger barrier.',
  },
  options: [
    { decision: 'proceed', rationale: 'Commit to building only after the causal and operational assumptions are supported.' },
    { decision: 'test', rationale: 'Buy evidence with a small, stock-confirmed concierge pilot.' },
    { decision: 'reshape', rationale: 'Change the bet if availability or price is the real repeat-order barrier.' },
    { decision: 'stop', rationale: 'Do not invest if shoppers reject the offer or operations cannot support it.' },
  ],
};
