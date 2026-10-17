export const COMMUNITY_FEEDBACK_CATEGORIES = [
  "WORK",
  "DISTANCE",
  "FEAR",
  "STIGMA",
  "LACK_OF_INFORMATION",
  "TRANSPORT",
] as const;

export type CommunityFeedbackCategory = (typeof COMMUNITY_FEEDBACK_CATEGORIES)[number];

export type CommunitySummary = {
  totalResponses: number;
  counts: Record<CommunityFeedbackCategory, number>;
};

export function isCommunityFeedbackCategory(value: unknown): value is CommunityFeedbackCategory {
  return typeof value === "string"
    && COMMUNITY_FEEDBACK_CATEGORIES.includes(value as CommunityFeedbackCategory);
}
