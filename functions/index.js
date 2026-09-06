const admin = require("firebase-admin");
const crypto = require("crypto");
const { accessFor } = require("./ai-policy");
const { stockAlerts } = require("./stock-alerts");
const familyAccess = async (familyId) => {
  const snap = await db.collection("families").doc(familyId).collection("services").doc("access").get();
  // previewPlan is written only after verifying the active family owner.
  return accessFor(snap.data(), true);
};
const { readApp, writeApp, assertWritable } = require("./app-storage");
const webpush = require("web-push");
const { defineSecret } = require("firebase-functions/params");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { HttpsError, onCall, onRequest } = require("firebase-functions/v2/https");
const { logger, setGlobalOptions } = require("firebase-functions/v2");

admin.initializeApp();
setGlobalOptions({ region: "asia-northeast1", maxInstances: 1 });

const db = admin.firestore();
Object.assign(exports, require("./ai-service")(db));
const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const mergeWindowMinutes = 15;
const mergeWindowMs = mergeWindowMinutes * 60 * 1000;
const defaultMilkGaugeWindowHours = 3;
const diaperGaugeWindowMinutes = 120;

const webPushPrivateKey = defineSecret("TWINLY_WEB_PUSH_PRIVATE_KEY");
const publicKey = "BKEpEJv5umbr7E9b5dptGP0YgCV8EdVo13tDzYxUHrue90qhqIddPtzGjxv5eFuRnQgghz_G_9yOCZQV3QS8SQI";
const subject = "mailto:no-reply@twinly.local";
const tokyoTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const formatReminderTime = (timestamp) => tokyoTimeFormatter.format(new Date(timestamp));
const normalizeWearToken = (token) => String(token || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
const hashWearToken = (token) => crypto.createHash("sha256").update(normalizeWearToken(token)).digest("hex");
const createEventId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
const inviteLifetimeMs = 24 * 60 * 60 * 1000;
const validRelationships = new Set(["father", "mother", "grandfather", "grandmother", "other"]);
const publicCallableOptions = { invoker: "public" };

const requireAuthUid = (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "ログインが必要です");
  return uid;
};

const validateFamilyProfile = (data) => {
  const nickname = String(data?.nickname || "").trim().slice(0, 20);
  const relationship = String(data?.relationship || "");
  if (!nickname) throw new HttpsError("invalid-argument", "ニックネームを入力してください");
  if (!validRelationships.has(relationship)) throw new HttpsError("invalid-argument", "続柄を選択してください");
  return { nickname, relationship };
};

const buildLegacyFamilyProfile = (request, userData = {}) => {
  const email = String(request.auth?.token?.email || userData.email || "").trim();
  const fallbackName = email.includes("@") ? email.split("@")[0] : "メンバー";
  const nickname = String(userData.displayName || request.auth?.token?.name || fallbackName)
    .trim()
    .slice(0, 20) || "メンバー";
  return { nickname, relationship: "other" };
};

const hashFamilyInvite = (token) => crypto.createHash("sha256").update(String(token || "")).digest("hex");

const getAppRefForUid = async (uid) => {
  const userSnap = await db.collection("users").doc(uid).get();
  const familyId = userSnap.data()?.activeFamilyId;
  if (familyId) {
    const member = await db.collection("families").doc(familyId).collection("members").doc(uid).get();
    if (!member.exists || member.data()?.status !== "active") throw new Error("Family access denied");
    if (member.data()?.role !== "owner" && !(await familyAccess(familyId)).features.familySharing) throw new Error("Family sharing is locked");
  }
  return familyId
    ? db.collection("families").doc(familyId).collection("app").doc("state")
    : db.collection("users").doc(uid).collection("app").doc("state");
};

exports.completeFamilyOnboarding = onCall(publicCallableOptions, async (request) => {
  const uid = requireAuthUid(request);
  const migrateLegacyOnly = request.data?.migrateLegacyOnly === true;
  const requestedProfile = migrateLegacyOnly ? null : validateFamilyProfile(request.data);
  const userRef = db.collection("users").doc(uid);
  const legacyAppRef = userRef.collection("app").doc("state");
  const [existingUserSnap, legacyAppSnap] = await Promise.all([
    userRef.get(),
    legacyAppRef.get(),
  ]);
  const existingFamilyId = existingUserSnap.data()?.activeFamilyId;

  // A brand-new account should still complete the profile screen. Existing users,
  // including accounts whose old app document is missing or unusually large, are
  // repaired automatically so data-copy trouble can never block sign-in again.
  if (migrateLegacyOnly && !existingUserSnap.exists && !legacyAppSnap.exists) {
    return { familyId: null };
  }
  const nextFamilyId = typeof existingFamilyId === "string" && existingFamilyId ? existingFamilyId : uid;
  const familyRef = db.collection("families").doc(nextFamilyId);
  const memberRef = familyRef.collection("members").doc(uid);
  const familyAppRef = familyRef.collection("app").doc("state");

  await db.runTransaction(async (transaction) => {
    const [familySnap, memberSnap] = await Promise.all([
      transaction.get(familyRef),
      transaction.get(memberRef),
    ]);

    if (familySnap.exists && existingFamilyId && !memberSnap.exists) {
      throw new HttpsError("permission-denied", "この家族のメンバーではありません");
    }

    const existingMember = memberSnap.data() || {};
    const profile = requestedProfile || (memberSnap.exists
      ? {
          nickname: String(existingMember.nickname || "メンバー"),
          relationship: validRelationships.has(existingMember.relationship) ? existingMember.relationship : "other",
        }
      : buildLegacyFamilyProfile(request, existingUserSnap.data()));

    transaction.set(
      userRef,
      {
        uid,
        activeFamilyId: nextFamilyId,
        displayName: admin.firestore.FieldValue.delete(),
        email: admin.firestore.FieldValue.delete(),
        photoURL: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    if (!familySnap.exists) {
      transaction.set(familyRef, {
        name: "わが家",
        ownerUid: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    transaction.set(
      memberRef,
      {
        uid,
        ...profile,
        profileCompleted: requestedProfile ? true : existingMember.profileCompleted === true,
        role: existingMember.role === "member" ? "member" : "owner",
        status: "active",
        joinedAt: existingMember.joinedAt || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  // Preserve the legacy document byte-for-byte. This happens only after the
  // family/member transaction succeeds; a large document can no longer roll back
  // the account repair and trap the user on the registration screen.
  if (legacyAppSnap.exists) {
    try {
      const familyAppSnap = await familyAppRef.get();
      if (!familyAppSnap.exists) {
        try { await familyAppRef.create(legacyAppSnap.data()); }
        catch (error) { if (error.code !== 6) throw error; }
      }
    } catch (error) {
      logger.error("Legacy app copy failed after family onboarding", { uid, familyId: nextFamilyId, error });
    }
  }

  return { familyId: nextFamilyId };
});

exports.createFamilyInvite = onCall(publicCallableOptions, async (request) => {
  const uid = requireAuthUid(request);
  const familyId = String(request.data?.familyId || "").trim();
  if (!familyId) throw new HttpsError("invalid-argument", "家族IDが必要です");

  const memberSnap = await db.collection("families").doc(familyId).collection("members").doc(uid).get();
  if (!memberSnap.exists || memberSnap.data()?.status !== "active" || memberSnap.data()?.role !== "owner") {
    throw new HttpsError("permission-denied", "管理者だけが家族を招待できます");
  }

  if (!(await familyAccess(familyId)).features.familySharing) throw new HttpsError("permission-denied", "家族共有は有料限定です");
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashFamilyInvite(token);
  const expiresAt = Date.now() + inviteLifetimeMs;
  await db.collection("familyInvites").doc(tokenHash).set({
    familyId,
    createdByUid: uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(expiresAt),
    usedAt: null,
    usedByUid: null,
  });
  return { token, expiresAt };
});

exports.joinFamily = onCall(publicCallableOptions, async (request) => {
  const uid = requireAuthUid(request);
  const profile = validateFamilyProfile(request.data);
  const token = String(request.data?.token || "").trim();
  if (token.length < 32) throw new HttpsError("invalid-argument", "招待リンクが正しくありません");

  const inviteRef = db.collection("familyInvites").doc(hashFamilyInvite(token));
  const userRef = db.collection("users").doc(uid);
  const familyId = await db.runTransaction(async (transaction) => {
    const [inviteSnap, userSnap] = await Promise.all([transaction.get(inviteRef), transaction.get(userRef)]);
    if (!inviteSnap.exists) throw new HttpsError("not-found", "招待リンクが見つかりません");
    const invite = inviteSnap.data();
    if (invite.usedAt) throw new HttpsError("failed-precondition", "この招待リンクは使用済みです");
    if (!invite.expiresAt || invite.expiresAt.toMillis() < Date.now()) {
      throw new HttpsError("deadline-exceeded", "招待リンクの期限が切れています");
    }
    if (userSnap.data()?.activeFamilyId && userSnap.data().activeFamilyId !== invite.familyId) {
      throw new HttpsError("failed-precondition", "すでに別の家族へ参加しています");
    }

    const familyRef = db.collection("families").doc(invite.familyId);
    const accessSnap = await transaction.get(familyRef.collection("services").doc("access"));
    if (!accessFor(accessSnap.data(), Boolean(process.env.TWINLY_TRIAL_FAMILY_ID) && invite.familyId === process.env.TWINLY_TRIAL_FAMILY_ID).features.familySharing) throw new HttpsError("permission-denied","招待先の家族共有は現在ロック中です");
    const memberRef = familyRef.collection("members").doc(uid);
    const [familySnap, memberSnap] = await Promise.all([
      transaction.get(familyRef),
      transaction.get(memberRef),
    ]);
    if (!familySnap.exists) throw new HttpsError("not-found", "招待先の家族が見つかりません");
    if (memberSnap.exists && memberSnap.data()?.status === "active") {
      throw new HttpsError("already-exists", "すでにこの家族へ参加しています");
    }
    transaction.set(
      userRef,
      {
        uid,
        activeFamilyId: invite.familyId,
        displayName: admin.firestore.FieldValue.delete(),
        email: admin.firestore.FieldValue.delete(),
        photoURL: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    transaction.set(memberRef, {
        uid,
        ...profile,
        profileCompleted: true,
        role: "member",
      status: "active",
      joinedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    transaction.update(inviteRef, {
      usedAt: admin.firestore.FieldValue.serverTimestamp(),
      usedByUid: uid,
    });
    return invite.familyId;
  });

  return { familyId };
});

const toAsciiDigits = (value) => String(value).replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10));
const normalizeKnownSpeechText = (text) =>
  String(text || "")
    .replace(/彼方|奏汰|奏太|奏多|金田|加奈多/g, "かなた")
    .replace(/日向|日なた/g, "ひなた");
const normalizeVoiceText = (text) =>
  normalizeKnownSpeechText(toAsciiDigits(text))
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[、。,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const includesAny = (text, words) => words.some((word) => text.includes(normalizeVoiceText(word)));

const knownNameAliases = {
  "奏汰": ["かなた", "カナタ"],
  "日向": ["ひなた", "ヒナタ"],
};

const detectTimestamp = (text, now = new Date()) => {
  const minuteAgoMatch = text.match(/(\d{1,3})\s*分前/);
  if (minuteAgoMatch) {
    const date = new Date(now);
    date.setMinutes(date.getMinutes() - Number(minuteAgoMatch[1]));
    return date.getTime();
  }

  const hourAgoMatch = text.match(/(\d{1,2})\s*時間前/);
  if (hourAgoMatch) {
    const date = new Date(now);
    date.setHours(date.getHours() - Number(hourAgoMatch[1]));
    return date.getTime();
  }

  const absoluteTimeMatch = text.match(/(\d{1,2})\s*(?:時|:)\s*(\d{1,2})?\s*(?:分)?/);
  if (absoluteTimeMatch) {
    const hour = Number(absoluteTimeMatch[1]);
    const minute = absoluteTimeMatch[2] ? Number(absoluteTimeMatch[2]) : 0;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      const date = new Date(now);
      date.setHours(hour, minute, 0, 0);
      return date.getTime();
    }
  }

  return undefined;
};

const parseKanjiNumber = (value) => {
  const digits = {
    "〇": 0,
    "零": 0,
    "一": 1,
    "二": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
  };
  const units = {
    "十": 10,
    "百": 100,
    "千": 1000,
  };

  if ([...value].every((char) => char in digits)) {
    return Number([...value].map((char) => digits[char]).join(""));
  }

  let total = 0;
  let current = 0;
  for (const char of value) {
    if (char in digits) {
      current = digits[char];
      continue;
    }
    if (char in units) {
      total += (current || 1) * units[char];
      current = 0;
    }
  }

  const parsed = total + current;
  return parsed > 0 ? parsed : null;
};

const detectMilkAmount = (text) => {
  const kanjiNumberPattern = "〇零一二三四五六七八九十百千";
  const mlMatch = text.match(new RegExp(`(\\d{1,4}|[${kanjiNumberPattern}]+)\\s*(?:ml|ミリ|みり)`));
  if (mlMatch) {
    return /^\d+$/.test(mlMatch[1]) ? Number(mlMatch[1]) : parseKanjiNumber(mlMatch[1]);
  }

  const textWithoutTimeExpressions = text
    .replace(/\d{1,2}\s*(?:時|:|：)\s*\d{0,2}\s*(?:分)?/g, " ")
    .replace(/\d{1,3}\s*(?:分前)/g, " ")
    .replace(/\d{1,2}\s*(?:時間前)/g, " ")
    .replace(new RegExp(`[${kanjiNumberPattern}]+\\s*時\\s*[${kanjiNumberPattern}]*\\s*(?:分)?`, "g"), " ")
    .replace(new RegExp(`[${kanjiNumberPattern}]+\\s*(?:分前|時間前)`, "g"), " ");

  const numberMatch = textWithoutTimeExpressions.match(/\d{1,4}/);
  if (numberMatch) return Number(numberMatch[0]);

  const kanjiNumberMatch = textWithoutTimeExpressions.match(new RegExp(`[${kanjiNumberPattern}]+`));
  return kanjiNumberMatch ? parseKanjiNumber(kanjiNumberMatch[0]) : null;
};

const parseVoiceTextWithRules = ({ text, profiles, defaultMilkMlByBaby = {}, forcedBabyId, now = new Date() }) => {
  const normalizedText = normalizeVoiceText(text);
  const babies = ["A", "B"];
  const babyId = forcedBabyId || babies.find((id) => {
    const profile = profiles?.[id] || {};
    const names = [
      profile.displayName,
      ...(profile.voiceAliases || []),
      ...(knownNameAliases[profile.displayName] || []),
      id,
    ].filter(Boolean);
    return names.some((name) => normalizedText.includes(normalizeVoiceText(name)));
  });
  const targetBabyId = babyId || "both";

  const isMilk = includesAny(normalizedText, ["ミルク", "授乳", "母乳", "哺乳", "milk"]);
  const isDiaper = includesAny(normalizedText, ["おむつ", "オムツ", "おしっこ", "しっこ", "うんち", "うんこ", "尿", "便"]);
  const timestamp = detectTimestamp(normalizedText, now);

  if (isMilk) {
    const detectedMilkMl = detectMilkAmount(normalizedText);
    const milkMl =
      detectedMilkMl ||
      (targetBabyId === "both" ? undefined : defaultMilkMlByBaby[targetBabyId]);
    const milkMlByBaby =
      targetBabyId === "both" && !detectedMilkMl
        ? {
            A: defaultMilkMlByBaby.A,
            B: defaultMilkMlByBaby.B,
          }
        : undefined;
    const hasFallback =
      targetBabyId === "both"
        ? typeof milkMlByBaby?.A === "number" && typeof milkMlByBaby?.B === "number"
        : typeof milkMl === "number";
    if (!detectedMilkMl && !hasFallback) return null;
    return {
      babyId: targetBabyId,
      type: "milk",
      timestamp,
      milkMl,
      milkMlByBaby,
      milkMethod: includesAny(normalizedText, ["母乳", "breast"]) ? "breast" : "bottle",
    };
  }

  if (isDiaper) {
    const hasPee = includesAny(normalizedText, ["おしっこ", "しっこ", "尿"]);
    const hasPoop = includesAny(normalizedText, ["うんち", "うんこ", "便"]);
    return {
      babyId: targetBabyId,
      type: "diaper",
      timestamp,
      diaperKind: hasPee && hasPoop ? "mix" : hasPoop ? "poop" : "pee",
    };
  }

  return null;
};

const parseVoiceTextWithGemini = async ({ text, profiles, defaultMilkMlByBaby = {}, forcedBabyId, now = new Date() }) => {
  if (!geminiApiKey) return null;

  const babies = ["A", "B"].map((id) => ({
    babyId: id,
    displayName: profiles?.[id]?.displayName || id,
    aliases: profiles?.[id]?.voiceAliases || [],
  }));
  const prompt = [
    "You extract baby care log events from Japanese voice transcripts.",
    "Return JSON only. No markdown.",
    forcedBabyId
      ? `The baby is already selected by the watch shortcut. You must set babyId to "${forcedBabyId}" even if the transcript names another baby.`
      : "No baby is preselected by the watch shortcut.",
    "If the transcript does not identify a baby, set babyId to \"both\".",
    "If milk amount is missing, use the latest amount for that baby. If babyId is both, use milkMlByBaby.",
    "Schema: {\"babyId\":\"A|B|both\",\"type\":\"milk|diaper\",\"timestamp\":number|null,\"milkMl\":number|null,\"milkMlByBaby\":{\"A\":number|null,\"B\":number|null}|null,\"milkMethod\":\"bottle|breast|null\",\"diaperKind\":\"pee|poop|mix|null\"}",
    `Current time ISO: ${now.toISOString()}`,
    `Babies: ${JSON.stringify(babies)}`,
    `Latest milk amounts by baby: ${JSON.stringify(defaultMilkMlByBaby)}`,
    `Transcript: ${text}`,
  ].join("\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    logger.warn("Gemini parse failed", { status: response.status, body: await response.text() });
    return null;
  }

  const json = await response.json();
  const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) return null;

  try {
    const parsed = JSON.parse(rawText);
    if (!["A", "B", "both"].includes(parsed.babyId)) return null;
    if (!["milk", "diaper"].includes(parsed.type)) return null;
    const babyId = forcedBabyId || parsed.babyId;
    const milkMlByBaby =
      parsed.milkMlByBaby ||
      (babyId === "both" && typeof parsed.milkMl !== "number"
        ? {
            A: defaultMilkMlByBaby.A,
            B: defaultMilkMlByBaby.B,
          }
        : undefined);
    const milkMl =
      typeof parsed.milkMl === "number"
        ? parsed.milkMl
        : babyId === "both"
        ? undefined
        : defaultMilkMlByBaby[babyId];

    return {
      babyId,
      type: parsed.type,
      timestamp: typeof parsed.timestamp === "number" ? parsed.timestamp : undefined,
      milkMl,
      milkMlByBaby,
      milkMethod: parsed.milkMethod === "breast" ? "breast" : "bottle",
      diaperKind: ["pee", "poop", "mix"].includes(parsed.diaperKind) ? parsed.diaperKind : "pee",
    };
  } catch (error) {
    logger.warn("Gemini JSON parse failed", { rawText, message: error.message });
    return null;
  }
};

const expandParsedBabyIds = (babyId) => (babyId === "both" ? ["A", "B"] : [babyId]);

const appendWearEvent = async ({ uid, transcript, parsed }) => {
  const appRef = await getAppRefForUid(uid);
  const parsedTimestamp = parsed.timestamp;
  const timestamp =
    typeof parsedTimestamp === "number" && Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now();
  const events = expandParsedBabyIds(parsed.babyId).map((babyId) => {
    const event = {
      id: createEventId(),
      babyId,
      type: parsed.type,
      timestamp,
      note: `wear: ${transcript}`,
      createdByUid: uid,
      updatedByUid: uid,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    if (parsed.type === "milk") {
      event.milkMl = parsed.milkMlByBaby?.[babyId] || parsed.milkMl;
      event.milkMethod = parsed.milkMethod || "bottle";
    } else {
      event.diaperKind = parsed.diaperKind || "pee";
    }

    return event;
  });

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(appRef);
    assertWritable(snap);
    const appState = snap.exists && snap.data()?.app ? snap.data().app : { profiles: {}, events: [], ui: {} };
    const nextAppState = {
      ...appState,
      events: [...events, ...(Array.isArray(appState.events) ? appState.events : [])],
    };

    for (const event of events.filter((item) => item.type === "diaper")) {
      if (nextAppState.diaperStockManagementEnabled === false) continue;
      const profile = nextAppState.profiles?.[event.babyId];
      const selectedSize = profile?.diaperSize;
      const currentStock = selectedSize ? profile?.diaperStockBySize?.[selectedSize] ?? 0 : null;
      if (selectedSize && currentStock !== null) {
        event.diaperSizeUsed = selectedSize;
        event.diaperStockConsumed = Math.min(1, Math.max(0, currentStock));
        const nextProfiles = { ...nextAppState.profiles };
        for (const id of ["A", "B"]) {
          const currentProfile = nextProfiles[id];
          if (!currentProfile) continue;
          nextProfiles[id] = {
            ...currentProfile,
            diaperStockBySize: {
              ...(currentProfile.diaperStockBySize || {}),
              [selectedSize]: Math.max(0, currentStock - 1),
            },
          };
        }
        nextAppState.profiles = nextProfiles;
      }
    }

    writeApp(transaction, appRef, snap, nextAppState, events, [], admin.firestore.FieldValue, uid);
  });

  return events;
};

const deleteWearEvents = async ({ uid, eventIds }) => {
  const appRef = await getAppRefForUid(uid);
  const targetIds = new Set(eventIds);

  let deletedCount = 0;
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(appRef);
    if (!snap.exists || !snap.data()?.app) return;

    assertWritable(snap);
    const appState = snap.data().app;
    const eventRows = snap.data()?.schemaVersion === 2
      ? await Promise.all(eventIds.map((id) => transaction.get(appRef.parent.parent.collection("events").doc(id)))) : null;
    const events = eventRows ? eventRows.filter((row) => row.exists).map((row) => ({ ...row.data(), id: row.id }))
      : Array.isArray(appState.events) ? appState.events : [];
    const deletingEvents = events.filter((event) => targetIds.has(event.id));
    if (!deletingEvents.length) return;

    const nextAppState = {
      ...appState,
      events: events.filter((event) => !targetIds.has(event.id)),
    };
    const nextProfiles = { ...(nextAppState.profiles || {}) };

    for (const event of deletingEvents.filter((item) => item.type === "diaper")) {
      const profile = nextProfiles[event.babyId];
      const selectedSize = event.diaperSizeUsed;
      if (!selectedSize || !event.diaperStockConsumed) continue;
      const currentStock = profile?.diaperStockBySize?.[selectedSize] ?? 0;

      for (const id of ["A", "B"]) {
        const currentProfile = nextProfiles[id];
        if (!currentProfile) continue;
        nextProfiles[id] = {
          ...currentProfile,
          diaperStockBySize: {
            ...(currentProfile.diaperStockBySize || {}),
            [selectedSize]: currentStock + event.diaperStockConsumed,
          },
        };
      }
    }

    nextAppState.profiles = nextProfiles;
    deletedCount = deletingEvents.length;

    writeApp(transaction, appRef, snap, nextAppState, [], [...targetIds], admin.firestore.FieldValue, uid);
  });

  return deletedCount;
};

const getDefaultMilkMlByBaby = (events) => {
  const result = {};
  for (const babyId of ["A", "B"]) {
    const latestMilk = [...(Array.isArray(events) ? events : [])]
      .filter((event) => event.babyId === babyId && event.type === "milk" && typeof event.milkMl === "number")
      .sort((left, right) => right.timestamp - left.timestamp)[0];
    if (typeof latestMilk?.milkMl === "number") {
      result[babyId] = latestMilk.milkMl;
    }
  }
  return result;
};

const clampMilkGaugeWindowHours = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultMilkGaugeWindowHours;
  return Math.max(0.5, Math.min(12, parsed));
};

const buildLatestCareCandidate = ({ appState, babyId, kind, lastSentByKey, legacyLastSentByBaby, nowMs }) => {
  const events = Array.isArray(appState?.events) ? appState.events : [];
  const profiles = appState?.profiles ?? {};
  const eventType = kind === "milk" ? "milk" : "diaper";
  const latestEvent = events
    .filter(
      (event) =>
        event.babyId === babyId &&
        event.type === eventType &&
        typeof event.timestamp === "number" &&
        event.timestamp <= nowMs
    )
    .sort((left, right) => right.timestamp - left.timestamp)[0];

  if (!latestEvent) return null;

  const reminderKey = `${babyId}:${kind}`;
  const lastSent = lastSentByKey?.[reminderKey] ?? (kind === "milk" ? legacyLastSentByBaby?.[babyId] : null);
  if (lastSent?.eventId === latestEvent.id) return null;

  const intervalMs =
    kind === "milk"
      ? clampMilkGaugeWindowHours(profiles[babyId]?.milkGaugeWindowHours) * 60 * 60 * 1000
      : diaperGaugeWindowMinutes * 60 * 1000;
  const dueAt = latestEvent.timestamp + intervalMs;

  return {
    babyId,
    kind,
    reminderKey,
    displayName: profiles[babyId]?.displayName ?? `赤ちゃん${babyId}`,
    eventId: latestEvent.id,
    occurredAt: latestEvent.timestamp,
    dueAt,
    dueNow: dueAt <= nowMs,
  };
};

const buildLatestMilkElapsedByBaby = (appState, nowMs = Date.now()) => {
  const events = Array.isArray(appState?.events) ? appState.events : [];

  return ["A", "B"].reduce((result, babyId) => {
    const latestMilkEvent = events
      .filter((event) => event.babyId === babyId && event.type === "milk" && typeof event.timestamp === "number")
      .sort((left, right) => right.timestamp - left.timestamp)[0];

    result[babyId] = latestMilkEvent
      ? {
          eventId: latestMilkEvent.id || null,
          milkAt: latestMilkEvent.timestamp,
          elapsedMinutes: Math.max(0, Math.floor((nowMs - latestMilkEvent.timestamp) / 60000)),
        }
      : null;

    return result;
  }, {});
};

const formatWearMilkElapsedText = (elapsedByBaby) => {
  const formatBaby = (babyId) => {
    const elapsedMinutes = elapsedByBaby?.[babyId]?.elapsedMinutes;
    return `${babyId}:${typeof elapsedMinutes === "number" ? `${elapsedMinutes}m` : "--"}`;
  };

  return {
    A: formatBaby("A"),
    B: formatBaby("B"),
  };
};

const groupCandidatesForNotification = (candidates, nowMs) => {
  const dueCandidates = candidates
    .filter((candidate) => candidate && candidate.dueNow)
    .sort((left, right) => left.dueAt - right.dueAt);

  if (!dueCandidates.length) return null;

  const primary = dueCandidates[0];
  const grouped = dueCandidates
    .filter((candidate) => candidate.dueAt - primary.dueAt <= mergeWindowMs && candidate.dueAt >= primary.dueAt);

  return grouped.length ? grouped : [primary];
};

const buildNotificationPayload = (group) => {
  if (group.length === 1) {
    const candidate = group[0];
    const time = formatReminderTime(candidate.occurredAt);
    const label = candidate.kind === "milk" ? "ミルク" : "おむつ";

    return {
      title: `${candidate.displayName}の${label}ゲージが空になりました`,
      body: `前回の${label}${candidate.kind === "diaper" ? "交換" : ""}は ${time} です`,
      tag: `care-reminder-${candidate.babyId}-${candidate.kind}-${candidate.eventId}`,
      url: "/",
    };
  }

  const body = group
    .map((candidate) => {
      const time = formatReminderTime(candidate.occurredAt);
      const label = candidate.kind === "milk" ? "ミルク" : "おむつ";
      return `${candidate.displayName}: ${label}（前回 ${time}）`;
    })
    .join("\n");

  return {
    title: "ケアゲージが空になりました",
    body,
    tag: `care-reminder-${group.map((candidate) => `${candidate.babyId}-${candidate.kind}`).join("-")}`,
    url: "/",
  };
};

const sendPushToDevices = async (uid, devices, payload) => {
  const tasks = devices.map(async (device) => {
    try {
      await webpush.sendNotification(device.subscription, JSON.stringify(payload), {
        TTL: 60 * 60,
        urgency: "high",
      });
      return { ok: true, deviceId: device.id };
    } catch (error) {
      const statusCode = error.statusCode || error.status;
      if (statusCode === 404 || statusCode === 410) {
        await db.collection("users").doc(uid).collection("devices").doc(device.id).delete();
      }
      logger.error("sendNotification failed", { uid, deviceId: device.id, statusCode, message: error.message });
      return { ok: false, deviceId: device.id };
    }
  });

  const results = await Promise.all(tasks);
  return results.some((result) => result.ok);
};

exports.sendMilkReminderNotifications = onSchedule(
  { schedule: "every 5 minutes", secrets: [webPushPrivateKey] },
  async () => {
  webpush.setVapidDetails(subject, publicKey, webPushPrivateKey.value());

  const nowMs = Date.now();
  const usersSnapshot = await db.collection("users").get();

  for (const userDoc of usersSnapshot.docs) {
    const uid = userDoc.id;
    const familyId = userDoc.data()?.activeFamilyId;
    const [settingsSnap, devicesSnap] = await Promise.all([
      db.collection("users").doc(uid).collection("settings").doc("notifications").get(),
      db.collection("users").doc(uid).collection("devices").where("notificationsEnabled", "==", true).get(),
    ]);

    if (devicesSnap.empty) continue;

    const settings = settingsSnap.exists ? settingsSnap.data() : {};
    const milkReminder = settings?.milkReminder ?? {};
    const careReminder = settings?.careReminder ?? {};
    if (careReminder.enabled === false || milkReminder.enabled === false) continue;

    let appState;
    try { appState = await readApp(await getAppRefForUid(uid)); }
    catch (error) { logger.warn("Reminder family unavailable", { uid, message: error.message }); continue; }
    if (!appState) continue;

    if (familyId && (await familyAccess(familyId)).features.stockNotifications) {
      const day = new Date(nowMs + 9*3600000).toISOString().slice(0,10);
      const alerts = stockAlerts(appState, nowMs).filter(a => settings.stockLastSent?.[a.size] !== day);
      const stockDevices = devicesSnap.docs.map(d => ({id:d.id,...d.data()})).filter(d => d.subscription?.endpoint && d.subscription?.keys?.auth && d.subscription?.keys?.p256dh);
      if (alerts.length && stockDevices.length) {
        const sent = await sendPushToDevices(uid, stockDevices, {title:"おむつの買い足し目安",body:alerts.map(a=>`${a.size}：残り${a.remaining}枚、約${Math.ceil(a.daysRemaining)}日分`).join(" / "),tag:"twinly-stock",url:"/"});
        if(sent) await settingsSnap.ref.set({stockLastSent:{...(settings.stockLastSent||{}),...Object.fromEntries(alerts.map(a=>[a.size,day]))}},{merge:true});
      }
    }
    const lastSentByKey = careReminder.lastSentByKey ?? {};
    const legacyLastSentByBaby = milkReminder.lastSentByBaby ?? {};
    const candidates = ["A", "B"].flatMap((babyId) =>
      ["milk", "diaper"]
        .map((kind) =>
          buildLatestCareCandidate({
            appState,
            babyId,
            kind,
            lastSentByKey,
            legacyLastSentByBaby,
            nowMs,
          })
        )
        .filter(Boolean)
    );

    const notificationGroup = groupCandidatesForNotification(candidates, nowMs);
    if (!notificationGroup) continue;

    const devices = devicesSnap.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .filter((device) => device.subscription?.endpoint && device.subscription?.keys?.auth && device.subscription?.keys?.p256dh);

    if (!devices.length) continue;

    const payload = buildNotificationPayload(notificationGroup);
    const sent = await sendPushToDevices(uid, devices, payload);

    if (!sent) continue;

    const nextLastSentByKey = { ...lastSentByKey };
    for (const candidate of notificationGroup) {
      nextLastSentByKey[candidate.reminderKey] = {
        eventId: candidate.eventId,
        sentAt: admin.firestore.Timestamp.fromMillis(nowMs),
      };
    }

    await db
      .collection("users")
      .doc(uid)
      .collection("settings")
      .doc("notifications")
      .set(
        {
          careReminder: {
            enabled: true,
            mergeWindowMinutes,
            diaperGaugeWindowMinutes,
            lastSentByKey: nextLastSentByKey,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  }
  }
);

exports.recordFromWear = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const token = req.body?.token;
  const transcript = String(req.body?.text || "").trim();
  const forcedBabyId = ["A", "B"].includes(req.body?.forcedBabyId) ? req.body.forcedBabyId : undefined;
  if (!token || !transcript) {
    res.status(400).json({ ok: false, error: "missing_token_or_text" });
    return;
  }

  try {
    const tokenHash = hashWearToken(token);
    const tokenSnap = await db.collection("wearPairingTokens").doc(tokenHash).get();
    if (!tokenSnap.exists || tokenSnap.data()?.active === false) {
      res.status(401).json({ ok: false, error: "invalid_pairing_token" });
      return;
    }

    const uid = tokenSnap.data().uid;
    const appRef = await getAppRefForUid(uid);
    const appState = await readApp(appRef);
    const profiles = appState?.profiles || {};
    const defaultMilkMlByBaby = getDefaultMilkMlByBaby(appState?.events);
    const now = new Date();
    const parsed =
      parseVoiceTextWithRules({ text: transcript, profiles, defaultMilkMlByBaby, forcedBabyId, now }) ||
      (await parseVoiceTextWithGemini({ text: transcript, profiles, defaultMilkMlByBaby, forcedBabyId, now }));

    if (!parsed) {
      res.status(422).json({ ok: false, error: "could_not_parse" });
      return;
    }
    if (
      parsed.type === "milk" &&
      typeof parsed.milkMl !== "number" &&
      !(
        parsed.babyId === "both" &&
        typeof parsed.milkMlByBaby?.A === "number" &&
        typeof parsed.milkMlByBaby?.B === "number"
      )
    ) {
      res.status(422).json({ ok: false, error: "missing_milk_amount" });
      return;
    }

    const events = await appendWearEvent({ uid, transcript, parsed });
    res.json({ ok: true, events });
  } catch (error) {
    logger.error("recordFromWear failed", { message: error.message, stack: error.stack });
    res.status(500).json({ ok: false, error: "internal" });
  }
});

exports.undoWearRecord = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const token = req.body?.token;
  const eventIds = Array.isArray(req.body?.eventIds)
    ? req.body.eventIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  if (!token || !eventIds.length || eventIds.length > 100 || eventIds.some((id) => id.includes("/"))) {
    res.status(400).json({ ok: false, error: "missing_token_or_event_ids" });
    return;
  }

  try {
    const tokenHash = hashWearToken(token);
    const tokenSnap = await db.collection("wearPairingTokens").doc(tokenHash).get();
    if (!tokenSnap.exists || tokenSnap.data()?.active === false) {
      res.status(401).json({ ok: false, error: "invalid_pairing_token" });
      return;
    }

    const deletedCount = await deleteWearEvents({ uid: tokenSnap.data().uid, eventIds });
    res.json({ ok: true, deletedCount });
  } catch (error) {
    logger.error("undoWearRecord failed", { message: error.message, stack: error.stack });
    res.status(500).json({ ok: false, error: "internal" });
  }
});

exports.latestMilkElapsedFromWear = onRequest({ cors: true }, async (req, res) => {
  if (!["GET", "POST"].includes(req.method)) {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const token = req.method === "GET" ? req.query?.token : req.body?.token;
  if (!token) {
    res.status(400).json({ ok: false, error: "missing_token" });
    return;
  }

  try {
    const tokenHash = hashWearToken(token);
    const tokenSnap = await db.collection("wearPairingTokens").doc(tokenHash).get();
    if (!tokenSnap.exists || tokenSnap.data()?.active === false) {
      res.status(401).json({ ok: false, error: "invalid_pairing_token" });
      return;
    }

    const uid = tokenSnap.data().uid;
    const appState = await readApp(await getAppRefForUid(uid));
    const elapsedByBaby = buildLatestMilkElapsedByBaby(appState);
    const text = formatWearMilkElapsedText(elapsedByBaby);

    res.json({
      ok: true,
      text,
      displayText: `${text.A}\n${text.B}`,
      elapsedByBaby,
    });
  } catch (error) {
    logger.error("latestMilkElapsedFromWear failed", { message: error.message, stack: error.stack });
    res.status(500).json({ ok: false, error: "internal" });
  }
});