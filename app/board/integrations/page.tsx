import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { composioConfigured, getConnections, syncConnections } from "@/lib/integrations/composio";
import { IntegrationsView } from "@/components/integrations/IntegrationsView";

export const metadata: Metadata = { title: "Integrations" };

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string; connect_failed?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const configured = composioConfigured();
  const connections = configured ? await syncConnections(user.id).catch(() => getConnections(user.id)) : await getConnections(user.id);
  return (
    <>
      <header className="flex items-center gap-3">
        <h1 className="m-0 flex-1 text-lg font-semibold tracking-[-0.015em]">Integrations</h1>
      </header>
      <IntegrationsView configured={configured} initial={connections} notice={sp} />
    </>
  );
}
