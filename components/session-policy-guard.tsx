"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserAuthClient } from "@/lib/auth-browser";
import { clearSessionPolicy, readSessionPolicy, saveSessionPolicy, sessionPolicyExpired, touchSessionPolicy } from "@/lib/session-policy";

export function SessionPolicyGuard() {
  const router = useRouter();
  useEffect(() => {
    const client = createBrowserAuthClient();
    if (!client) return;
    const authClient = client;
    let signingOut = false;

    async function enforce() {
      const { data } = await authClient.auth.getSession();
      if (!data.session) return;
      let policy = readSessionPolicy();
      if (!policy) {
        saveSessionPolicy("idle");
        policy = readSessionPolicy();
      }
      if (!policy || !sessionPolicyExpired(policy) || signingOut) return;
      signingOut = true;
      clearSessionPolicy();
      await authClient.auth.signOut();
      router.push("/account?auth=session-expired");
      router.refresh();
    }

    const activityEvents: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "scroll", "touchstart"];
    const onActivity = () => {
      const policy = readSessionPolicy();
      if (policy && !sessionPolicyExpired(policy)) touchSessionPolicy();
      else void enforce();
    };
    activityEvents.forEach((eventName) => window.addEventListener(eventName, onActivity, { passive: true }));
    window.addEventListener("focus", enforce);
    document.addEventListener("visibilitychange", enforce);
    const interval = window.setInterval(() => void enforce(), 60_000);
    void enforce();

    const { data: listener } = authClient.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") clearSessionPolicy();
    });
    return () => {
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, onActivity));
      window.removeEventListener("focus", enforce);
      document.removeEventListener("visibilitychange", enforce);
      window.clearInterval(interval);
      listener.subscription.unsubscribe();
    };
  }, [router]);

  return null;
}
