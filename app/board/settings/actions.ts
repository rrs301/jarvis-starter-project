"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { setAiProviderSetting } from "@/lib/data";
import { isProvider } from "@/lib/ai/config";

/** Saves the user's AI provider choice; null resets to the app default. */
export async function setAiProviderAction(provider: string | null) {
  const user = await requireUser();
  if (provider !== null && !isProvider(provider)) throw new Error("Unknown provider");
  await setAiProviderSetting(user.id, provider);
  revalidatePath("/board/settings");
}
