import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign,
} from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function getPushAdmin() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Missing Supabase server credentials.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  requireInteraction?: boolean;
  data?: Record<string, unknown>;
};

type StoredPushSubscription = {
  id: string;
  user_id: string;
  salon_id: string | null;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
};

function base64UrlToBuffer(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="), "base64");
}

function bufferToBase64Url(value: Buffer) {
  return value.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function hmac(key: Buffer, value: Buffer) {
  return createHmac("sha256", key).update(value).digest();
}

function hkdfExpand(prk: Buffer, info: Buffer, length: number) {
  let output = Buffer.alloc(0);
  let previous = Buffer.alloc(0);
  for (let counter = 1; output.length < length; counter += 1) {
    previous = hmac(prk, Buffer.concat([previous, info, Buffer.from([counter])]));
    output = Buffer.concat([output, previous]);
  }
  return output.subarray(0, length);
}

function encryptPayload(payload: Buffer, clientPublicKey: Buffer, authSecret: Buffer) {
  if (clientPublicKey.length !== 65 || clientPublicKey[0] !== 4) throw new Error("Invalid Web Push client key.");
  const local = createECDH("prime256v1");
  local.generateKeys();
  const serverPublicKey = local.getPublicKey();
  const sharedSecret = local.computeSecret(clientPublicKey);
  const authPrk = hmac(authSecret, sharedSecret);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0", "utf8"), clientPublicKey, serverPublicKey]);
  const inputKeyMaterial = hkdfExpand(authPrk, keyInfo, 32);
  const salt = randomBytes(16);
  const prk = hmac(salt, inputKeyMaterial);
  const contentEncryptionKey = hkdfExpand(prk, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdfExpand(prk, Buffer.from("Content-Encoding: nonce\0"), 12);
  const plaintext = Buffer.concat([payload, Buffer.from([2])]);
  const cipher = createCipheriv("aes-128-gcm", contentEncryptionKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, recordSize, Buffer.from([serverPublicKey.length]), serverPublicKey, ciphertext]);
}

function vapidAuthorization(endpoint: string) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || "";
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:support@girlzculture.com";
  if (!publicKey || !privateKey) throw new Error("Web Push VAPID keys are not configured.");
  const publicBytes = base64UrlToBuffer(publicKey);
  const privateBytes = base64UrlToBuffer(privateKey);
  if (publicBytes.length !== 65 || privateBytes.length !== 32) throw new Error("Invalid VAPID key length.");
  const audience = new URL(endpoint).origin;
  const header = bufferToBase64Url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bufferToBase64Url(Buffer.from(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: subject })));
  const signingInput = `${header}.${claims}`;
  const privateKeyObject = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: bufferToBase64Url(privateBytes),
      x: bufferToBase64Url(publicBytes.subarray(1, 33)),
      y: bufferToBase64Url(publicBytes.subarray(33, 65)),
    },
    format: "jwk",
  });
  const signature = sign("sha256", Buffer.from(signingInput), { key: privateKeyObject, dsaEncoding: "ieee-p1363" });
  return `vapid t=${signingInput}.${bufferToBase64Url(signature)}, k=${publicKey}`;
}

async function refreshSalonReachability(salonId: string) {
  const admin = getPushAdmin();
  const { count } = await admin
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("salon_id", salonId)
    .eq("permission_status", "granted")
    .is("revoked_at", null);
  await admin.from("salons").update({ push_reachable: Number(count || 0) > 0 }).eq("id", salonId);
}

async function deliver(subscription: StoredPushSubscription, payload: PushPayload) {
  const body = encryptPayload(
    Buffer.from(JSON.stringify(payload), "utf8"),
    base64UrlToBuffer(subscription.p256dh),
    base64UrlToBuffer(subscription.auth_secret),
  );
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: vapidAuthorization(subscription.endpoint),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "high",
    },
    body,
  });
  if (response.ok || response.status === 201) return { delivered: true as const };
  if (response.status === 404 || response.status === 410) return { delivered: false as const, revoked: true as const, error: `Push endpoint expired (${response.status}).` };
  return { delivered: false as const, revoked: false as const, error: `Push service returned ${response.status}: ${await response.text()}` };
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return { skipped: true, delivered: 0, failed: 0, revoked: 0 };
  const admin = getPushAdmin();
  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id,user_id,salon_id,endpoint,p256dh,auth_secret")
    .in("user_id", ids)
    .eq("permission_status", "granted")
    .is("revoked_at", null);
  if (error) throw error;
  const subscriptions = (data || []) as StoredPushSubscription[];
  if (!subscriptions.length) return { skipped: true, delivered: 0, failed: 0, revoked: 0 };
  let delivered = 0;
  let failed = 0;
  let revoked = 0;
  const affectedSalons = new Set<string>();
  for (const subscription of subscriptions) {
    try {
      const result = await deliver(subscription, payload);
      if (result.delivered) {
        delivered += 1;
        await admin.from("push_subscriptions").update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", subscription.id);
      } else {
        failed += 1;
        if (result.revoked) {
          revoked += 1;
          await admin.from("push_subscriptions").update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", subscription.id);
          if (subscription.salon_id) affectedSalons.add(subscription.salon_id);
        }
        console.error("Web Push delivery failed", { subscriptionId: subscription.id, userId: subscription.user_id, error: result.error });
      }
    } catch (error) {
      failed += 1;
      console.error("Web Push delivery failed", { subscriptionId: subscription.id, userId: subscription.user_id, error });
    }
  }
  await Promise.all([...affectedSalons].map(refreshSalonReachability));
  if (!delivered && failed) throw new Error(`Web Push failed for ${failed} subscribed device${failed === 1 ? "" : "s"}.`);
  return { skipped: false, delivered, failed, revoked };
}
