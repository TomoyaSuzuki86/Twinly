const tokenAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

export const normalizeWearPairingToken = (token: string) => token.replace(/[^a-z0-9]/gi, "").toUpperCase();

export const formatWearPairingToken = (token: string) => {
  const normalized = normalizeWearPairingToken(token);
  return normalized.match(/.{1,4}/g)?.join("-") ?? normalized;
};

export const createWearPairingToken = () => {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const token = [...bytes].map((byte) => tokenAlphabet[byte % tokenAlphabet.length]).join("");
  return formatWearPairingToken(token);
};

export const hashWearPairingToken = async (token: string) => {
  const normalized = normalizeWearPairingToken(token);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return toHex(digest);
};
