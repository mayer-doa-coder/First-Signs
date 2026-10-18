import "server-only";

type ReferralRpcRow = {
  referral_id: string;
  access_token: string;
  status: string;
  tb_center_id: string;
  centre_name: string;
  centre_area: string;
  centre_district: string;
  service_type: string;
  created_at: string;
  reward_created: boolean;
};

export type ReferralRpcFunction =
  | "create_part9_referral"
  | "get_part9_referral"
  | "get_part10_referral_for_verification"
  | "complete_part10_referral"
  | "save_part11_screening"
  | "get_part11_pharmacy_dashboard"
  | "get_part13_government_dashboard"
  | "get_part14_care_status"
  | "get_part12_follow_up"
  | "simulate_part12_follow_up"
  | "save_part12_follow_up_barrier"
  | "get_part16_channel_session"
  | "save_part16_channel_session"
  | "begin_part16_channel_event"
  | "complete_part16_channel_event"
  | "release_part16_channel_event"
  | "get_part18_community_summary"
  | "submit_part18_community_feedback"
  | "save_multisyndrome_screening"
  | "create_multisyndrome_referral"
  | "save_care_signal"
  | "get_multisyndrome_summary"
  | "record_public_health_action";

const MAX_RPC_ATTEMPTS = 2;
const TRANSIENT_RPC_STATUSES = new Set([500, 502, 503, 504]);

function waitBeforeRetry() {
  return new Promise((resolve) => setTimeout(resolve, 150));
}

function configuration() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return {
    url,
    serviceRoleKey,
    usesLegacyJwt: !serviceRoleKey.startsWith("sb_secret_"),
  };
}

export function isReferralDatabaseConfigured() {
  return configuration() !== null;
}

export async function callSupabaseRpc<T>(
  functionName: ReferralRpcFunction,
  body: object,
) {
  const config = configuration();
  if (!config) throw new Error("REFERRAL_BACKEND_NOT_CONFIGURED");

  for (let attempt = 1; attempt <= MAX_RPC_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${config.url}/rest/v1/rpc/${functionName}`, {
        method: "POST",
        headers: {
          apikey: config.serviceRoleKey,
          ...(config.usesLegacyJwt ? { authorization: `Bearer ${config.serviceRoleKey}` } : {}),
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      if (attempt === MAX_RPC_ATTEMPTS) throw new Error("SUPABASE_RPC_NETWORK");
      await waitBeforeRetry();
      continue;
    }

    if (response.ok) {
      return await response.json() as T;
    }

    if (!TRANSIENT_RPC_STATUSES.has(response.status) || attempt === MAX_RPC_ATTEMPTS) {
      throw new Error(`SUPABASE_RPC_${response.status}`);
    }

    // Creation is idempotent by screening_id, so retrying a transient 5xx
    // cannot create a second referral or consume a second referral number.
    await waitBeforeRetry();
  }

  throw new Error("SUPABASE_RPC_RETRY_EXHAUSTED");
}

export function callReferralRpc<T extends Record<string, unknown> = ReferralRpcRow>(
  functionName: ReferralRpcFunction,
  body: object,
) {
  return callSupabaseRpc<T[]>(functionName, body);
}
