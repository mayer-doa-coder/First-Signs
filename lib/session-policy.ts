"use client";

export type SessionPolicyMode = "remember" | "idle";

const STORAGE_KEY = "first-signs-session-policy-v1";
const ONE_HOUR_MS = 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * ONE_HOUR_MS;

type SessionPolicy = {
  mode: SessionPolicyMode;
  startedAt: number;
  lastActivityAt: number;
};

export function saveSessionPolicy(mode: SessionPolicyMode) {
  const now = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, startedAt: now, lastActivityAt: now } satisfies SessionPolicy));
}

export function clearSessionPolicy() {
  localStorage.removeItem(STORAGE_KEY);
}

export function readSessionPolicy(): SessionPolicy | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<SessionPolicy> | null;
    if (!value || (value.mode !== "remember" && value.mode !== "idle") || !Number.isFinite(value.startedAt) || !Number.isFinite(value.lastActivityAt)) return null;
    return value as SessionPolicy;
  } catch {
    return null;
  }
}

export function sessionPolicyExpired(policy: SessionPolicy, now = Date.now()) {
  return policy.mode === "remember"
    ? now - policy.startedAt >= THIRTY_DAYS_MS
    : now - policy.lastActivityAt >= ONE_HOUR_MS;
}

export function touchSessionPolicy(now = Date.now()) {
  const policy = readSessionPolicy();
  if (!policy || policy.mode === "remember" || now - policy.lastActivityAt < 30_000) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...policy, lastActivityAt: now }));
}
