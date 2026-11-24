import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getAiProviderSetting } from "@/lib/data";
import { defaultProvider, isProvider, PROVIDER_LABEL, providerStatus, resolveProvider } from "@/lib/ai/config";
import { AiSettings } from "@/components/settings/AiSettings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const saved = await getAiProviderSetting(user.id).catch(() => null);
  const chosen = isProvider(saved) ? saved : null;
  const envDefault = defaultProvider();
  const active = resolveProvider(chosen);

  return (
    <>
      <header className="flex items-center gap-3">
        <h1 className="m-0 flex-1 text-lg font-semibold tracking-[-0.015em]">Settings</h1>
      </header>
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-4">
        <AiSettings
          providers={providerStatus()}
          chosen={chosen}
          envDefault={envDefault}
          envDefaultLabel={PROVIDER_LABEL[envDefault]}
          active={active}
        />
        <section className="rounded-[26px] border border-line bg-card p-[18px] shadow-card">
          <h2 className="m-0 text-sm font-medium text-muted">Account</h2>
          <p className="m-0 mt-2 font-medium">{user.email}</p>
        </section>
      </div>
    </>
  );
}
