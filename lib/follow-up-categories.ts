export const FOLLOW_UP_BARRIERS = [
  "WORK_SCHEDULE",
  "CENTRE_TOO_FAR",
  "FEAR",
  "STIGMA",
  "TRANSPORT_PROBLEM",
  "DID_NOT_UNDERSTAND",
  "OTHER",
] as const;

export type FollowUpBarrier = (typeof FOLLOW_UP_BARRIERS)[number];

export const FOLLOW_UP_ACTIONS = [
  "PLAN_SUITABLE_TIME",
  "SHOW_ANOTHER_CENTRE",
  "EXPLAIN_EVALUATION",
  "PRIVACY_AND_SUPPORT",
  "SEEK_TRANSPORT_SUPPORT",
  "EXPLAIN_WHY_EVALUATION_MATTERS",
  "HUMAN_SUPPORT",
] as const;

export type FollowUpAction = (typeof FOLLOW_UP_ACTIONS)[number];
