import { PoliticalIntelligenceClient } from "@/features/intelligence/components/political-intelligence-client";
import { requireWorkspaceContext } from "@/lib/auth/workspace";

export default async function IntelligencePage() {
  const workspace = await requireWorkspaceContext();

  return <PoliticalIntelligenceClient campaignId={workspace.campaign.id} />;
}
