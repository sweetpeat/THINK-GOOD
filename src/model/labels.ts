// Enum display labels (§2.2) — used everywhere, including exports.

import type {
  Confidence,
  EdgeType,
  EventDirection,
  EventResult,
  InfoCredibility,
  KillChainPhase,
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

export const PHASE_LABELS: Record<KillChainPhase, string> = {
  reconnaissance: 'Reconnaissance',
  weaponization: 'Weaponization',
  delivery: 'Delivery',
  exploitation: 'Exploitation',
  installation: 'Installation',
  command_and_control: 'Command & control',
  actions_on_objectives: 'Actions on objectives',
};

export const RESULT_LABELS: Record<EventResult, string> = {
  success: 'Success',
  failure: 'Failure',
  unknown: 'Unknown',
};

export const DIRECTION_LABELS: Record<EventDirection, string> = {
  adversary_to_infrastructure: 'Adversary → infrastructure',
  infrastructure_to_adversary: 'Infrastructure → adversary',
  infrastructure_to_victim: 'Infrastructure → victim',
  victim_to_infrastructure: 'Victim → infrastructure',
  infrastructure_to_infrastructure: 'Infrastructure → infrastructure',
  bidirectional: 'Bidirectional',
  unknown: 'Unknown',
};

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  question: 'Question',
  claim: 'Claim',
  assumption: 'Assumption',
  evidence: 'Evidence',
  incident: 'Incident',
  diamond_event: 'Event',
  adversary: 'Adversary',
  capability: 'Capability',
  infrastructure: 'Infrastructure',
  victim: 'Victim',
};

export const NODE_TYPE_PLURALS: Record<NodeType, string> = {
  question: 'questions',
  claim: 'claims',
  assumption: 'assumptions',
  evidence: 'evidence',
  incident: 'incidents',
  diamond_event: 'events',
  adversary: 'adversaries',
  capability: 'capabilities',
  infrastructure: 'infrastructure',
  victim: 'victims',
};

export const EDGE_TYPE_LABELS: Record<EdgeType, string> = {
  consistent_with: 'consistent with',
  inconsistent_with: 'inconsistent with',
  rests_on: 'rests on',
  answers: 'answers',
  characterizes: 'characterizes',
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
  phase: 'Kill-chain phase',
  result: 'Result',
  direction: 'Direction',
  occurredAt: 'Occurred',
};

export function judgementValueLabel(field: string, value: unknown): string {
  if (value == null) return 'undeclared';
  switch (field) {
    case 'phase':
      return PHASE_LABELS[value as KillChainPhase] ?? String(value);
    case 'result':
      return RESULT_LABELS[value as EventResult] ?? String(value);
    case 'direction':
      return DIRECTION_LABELS[value as EventDirection] ?? String(value);
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
