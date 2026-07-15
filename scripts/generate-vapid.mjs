import { createECDH } from "node:crypto";

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
const encode = (value) => value.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${encode(ecdh.getPublicKey())}`);
console.log(`VAPID_PRIVATE_KEY=${encode(ecdh.getPrivateKey())}`);
console.log("VAPID_SUBJECT=mailto:support@girlzculture.com");
