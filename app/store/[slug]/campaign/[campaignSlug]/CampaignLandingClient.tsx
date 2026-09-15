"use client";
import { useEffect, useState } from "react";
import { shareOrCopy } from "@/lib/storefront/share";
import { trackStoreEvent } from "@/lib/storefront/events-client";
export function CampaignLandingClient({ storeSlug, campaignSlug, campaignName, announcement }: { storeSlug: string; campaignSlug: string; campaignName: string; announcement: string }) {
  const [msg, setMsg] = useState("");
  useEffect(() => { void trackStoreEvent({ storeSlug, eventType: "campaign_view", metadata: { campaignSlug } }); }, [storeSlug, campaignSlug]);
  async function onShare() {
    const url = `${window.location.origin}/store/${storeSlug}/campaign/${campaignSlug}`;
    const result = await shareOrCopy({ title: campaignName, text: announcement || campaignName, url });
    setMsg(result === "shared" ? "Shared" : result === "copied" ? "Link copied" : "Could not share");
    setTimeout(() => setMsg(""), 2000);
  }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => void onShare()} className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm">Share campaign</button>
      <a href={`https://wa.me/?text=${encodeURIComponent(`${campaignName}\n${announcement || ""}`.trim())}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm">WhatsApp</a>
      {msg && <span className="text-xs text-ink-500">{msg}</span>}
    </div>
  );
}
