export const CAMPAIGN_TYPES = ["announcement","featured_products","coupon_promotion","seasonal_sale","limited_offer"] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];
export const CAMPAIGN_STATUSES = ["draft","scheduled","active","paused","expired"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export function isCampaignType(v: string): v is CampaignType { return (CAMPAIGN_TYPES as readonly string[]).includes(v); }
export function isCampaignStatus(v: string): v is CampaignStatus { return (CAMPAIGN_STATUSES as readonly string[]).includes(v); }
export const ALLOWED_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ["scheduled", "active"],
  scheduled: ["active", "paused", "draft", "expired"],
  active: ["paused", "expired"],
  paused: ["active", "expired", "draft"],
  expired: [],
};
export function canTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
export type CampaignRow = {
  id: number; storeId: number; name: string; slug: string; description: string;
  campaignType: string; status: string; startsAt: Date | null; endsAt: Date | null;
  bannerUrl: string | null; announcementText: string | null; couponId: number | null;
  createdAt: Date; updatedAt: Date; productIds?: number[];
};
export type PublicCampaign = {
  id: number; name: string; slug: string; description: string; campaignType: string;
  bannerUrl: string | null; announcementText: string | null; startsAt: string | null;
  endsAt: string | null; couponCode?: string | null; couponLabel?: string | null; productIds: number[];
};
