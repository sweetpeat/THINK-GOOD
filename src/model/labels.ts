// Enum display labels (§2.2) — used everywhere, including exports.

import type {
  Confidence,
  EdgeType,
  InfoCredibility,
  Likelihood,
  NodeType,
  Priority,
  SourceReliability,
  Validity,
} from './types';

export const LIKELIHOOD_LABELS: Record<Likelihood, string> = {
  remote_chance: 'Remote chance',
  highly_unlikely: 'Highly unlikely',
  unlikely: 'Unlikely',
  realistic_possibility: 'Realistic possibility',
  likely: 'Likely / probable',
  highly_likely: 'Highly likely',
  almost_certain: 'Almost certain',
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
};

export const VALIDITY_LABELS: Record<Validity, string> = {
  supported: 'Supported',
  caveated: 'Caveated',
  unsupported: 'Unsupported',
};

export const RELIABILITY_LABELS: Record<SourceReliability, string> = {
  A: 'A Completely reliable',
  B: 'B Usually reliable',
  C: 'C Fairly reliable',
  D: 'D Not usually reliable',
  E: 'E Unreliable',
  F: 'F Cannot be judged',
};

export const CREDIBILITY_LABELS: Record<InfoCredibility, string> = {
  1: '1 Confirmed by other sources',
  2: '2 Probably true',
  3: '3 Possibly true',
  4: '4 Doubtful',
  5: '5 Improbable',
  6: '6 Cannot be judged',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
};

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  question: 'Question',
  claim: 'Claim',
  assumption: 'Assumption',
  evidence: 'Evidence',
};

export const EDGE_TYPE_LABELS: Record<EdgeType, string> = {
  consistent_with: 'consistent with',
  inconsistent_with: 'inconsistent with',
  rests_on: 'rests on',
  answers: 'answers',
};

// Admiralty grade as data, e.g. "B2"; either half may be ungraded.
export function admiraltyGrade(rel?: SourceReliability, cred?: InfoCredibility): string {
  if (rel == null && cred == null) return 'ungraded';
  return `${rel ?? '·'}${cred ?? '·'}`;
}

export const FIELD_LABELS: Record<string, string> = {
  likelihood: 'Likelihood',
  confidence: 'Confidence',
  validity: 'Validity',
  sourceReliability: 'Source reliability',
  infoCredibility: 'Info credibility',
  linchpin: 'Linchpin',
  priority: 'Priority',
  mutuallyExclusive: 'Mutually exclusive',
};

export function judgementValueLabel(field: string, value: unknown): string {
  if (value == null) return 'undeclared';
  switch (field) {
    case 'likelihood':
      return LIKELIHOOD_LABELS[value as Likelihood] ?? String(value);
    case 'confidence':
      return CONFIDENCE_LABELS[value as Confidence] ?? String(value);
    case 'validity':
      return VALIDITY_LABELS[value as Validity] ?? String(value);
    case 'sourceReliability':
      return RELIABILITY_LABELS[value as SourceReliability] ?? String(value);
    case 'infoCredibility':
      return CREDIBILITY_LABELS[value as InfoCredibility] ?? String(value);
    case 'priority':
      return PRIORITY_LABELS[value as Priority] ?? String(value);
    case 'linchpin':
    case 'mutuallyExclusive':
      return value ? 'yes' : 'no';
    default:
      return String(value);
  }
}
