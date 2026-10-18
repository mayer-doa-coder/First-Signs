"use client";

import { useEffect, useState } from "react";
import { AssistantChat } from "@/components/assistant-chat";
import { Icon } from "@/components/icons";
import { useLanguage } from "@/components/language";
import { createBrowserAuthClient } from "@/lib/auth-browser";

export function AssistantLauncher() {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [staffWorkspace, setStaffWorkspace] = useState(false);

  useEffect(() => {
    const client = createBrowserAuthClient();
    if (!client) return;
    void client.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const response = await fetch("/api/account", { cache: "no-store" });
      if (!response.ok) return;
      const role = ((await response.json()) as { primaryRole: string }).primaryRole;
      setStaffWorkspace(role !== "PATIENT");
    });
  }, []);

  if (staffWorkspace) return null;

  return <div className="assistant-launcher">
    {open && <div className="assistant-overlay" role="dialog" aria-modal="true" aria-label={language === "bn" ? "স্বাস্থ্য সহায়ক" : "Health assistant"}><AssistantChat variant="drawer" onClose={() => setOpen(false)} /></div>}
    <button type="button" className="assistant-launch-button" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-label={language === "bn" ? "স্বাস্থ্য সহায়ক খুলুন" : "Open health assistant"}>
      <Icon name="care" /><span>{language === "bn" ? "সহায়ক" : "Assistant"}</span>
    </button>
  </div>;
}
