const admin = require("firebase-admin");
const crypto = require("crypto");
const webpush = require("web-push");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { logger, setGlobalOptions } = require("firebase-functions/v2");

admin.initializeApp();
setGlobalOptions({ region: "asia-northeast1", maxInstances: 1 });

const db = admin.firestore();
const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const intervalMinutes = 150;
const mergeWindowMinutes = 15;
const mergeWindowMs = mergeWindowMinutes * 60 * 1000;

const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
const subject = process.env.WEB_PUSH_SUBJECT || "mailto:no-reply@twinly.local";
const tokyoTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

const formatReminderTime = (timestamp) => tokyoTimeFormatter.format(new Date(timestamp));
const normalizeWearToken = (token) => String(token || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
const hashWearToken = (token) => crypto.createHash("sha256").update(normalizeWearToken(token)).digest("hex");
const createEventId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const toAsciiDigits = (value) => String(value).replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10));
const normalizeVoiceText = (text) =>
  toAsciiDigits(text)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[、。,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const includesAny = (text, words) => words.some((word) => text.includes(normalizeVoiceText(word)));

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

const parseVoiceTextWithRules = ({ text, profiles, defaultMilkMlByBaby = {}, now = new Date() }) => {
  const normalizedText = normalizeVoiceText(text);
  const babies = ["A", "B"];
  const babyId = babies.find((id) => {
    const profile = profiles?.[id] || {};
    const names = [profile.displayName, ...(profile.voiceAliases || []), id].filter(Boolean);
    return names.some((name) => normalizedText.includes(normalizeVoiceText(name)));
  });
  const targetBabyId = babyId || "both";

  const isMilk = includesAny(normalizedText, ["ミルク", "授乳", "母乳", "哺乳", "milk"]);
  const isDiaper = includesAny(normalizedText, ["おむつ", "オムツ", "おしっこ", "しっこ", "うんち", "うんこ", "尿", "便"]);
  const timestamp = detectTimestamp(normalizedText, now);

  if (isMilk) {
    const amountMatch = normalizedText.match(/(\d{1,4})\s*(?:ml|ミリ|みり)?/);
    const detectedMilkMl = amountMatch ? Number(amountMatch[1]) : null;
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

const parseVoiceTextWithGemini = async ({ text, profiles, defaultMilkMlByBaby = {}, now = new Date() }) => {
  if (!geminiApiKey) return null;

  const babies = ["A", "B"].map((id) => ({
    babyId: id,
    displayName: profiles?.[id]?.displayName || id,
    aliases: profiles?.[id]?.voiceAliases || [],
  }));
  const prompt = [
    "You extract baby care log events from Japanese voice transcripts.",
    "Return JSON only. No markdown.",
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
    const babyId = parsed.babyId;
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
  const appRef = db.collection("users").doc(uid).collection("app").doc("state");
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
    const appState = snap.exists && snap.data()?.app ? snap.data().app : { profiles: {}, events: [], ui: {} };
    const nextAppState = {
      ...appState,
      events: [...events, ...(Array.isArray(appState.events) ? appState.events : [])],
    };

    for (const event of events.filter((item) => item.type === "diaper")) {
      const profile = nextAppState.profiles?.[event.babyId];
      const selectedSize = profile?.diaperSize;
      const currentStock = selectedSize ? profile?.diaperStockBySize?.[selectedSize] ?? 0 : null;
      if (selectedSize && currentStock !== null) {
        const nextProfiles = { ...nextAppState.profiles };
        for (const id of ["A", "B"]) {
          const currentProfile = nextProfiles[id];
          if (!currentProfile) continue;
          nextProfiles[id] = {
            ...currentProfile,
            diaperStockBySize: {
              ...(currentProfile.diaperStockBySize || {}),
              [selectedSize]: currentStock - 1,
            },
          };
        }
        nextAppState.profiles = nextProfiles;
      }
    }

    transaction.set(
      appRef,
      {
        app: nextAppState,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: "wear",
      },
      { merge: true }
    );
  });

  return events;
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

const buildLatestMilkCandidate = ({ appState, babyId, lastSentByBaby, nowMs }) => {
  const events = Array.isArray(appState?.events) ? appState.events : [];
  const profiles = appState?.profiles ?? {};
  const latestMilkEvent = events
    .filter((event) => event.babyId === babyId && event.type === "milk")
    .sort((left, right) => right.timestamp - left.timestamp)[0];

  if (!latestMilkEvent) return null;

  const lastSent = lastSentByBaby?.[babyId];
  if (lastSent?.eventId === latestMilkEvent.id) return null;

  const dueAt = latestMilkEvent.timestamp + intervalMinutes * 60 * 1000;

  return {
    babyId,
    displayName: profiles[babyId]?.displayName ?? `赤ちゃん${babyId}`,
    eventId: latestMilkEvent.id,
    milkAt: latestMilkEvent.timestamp,
    dueAt,
    dueNow: dueAt <= nowMs,
  };
};

const groupCandidatesForNotification = (candidates, nowMs) => {
  const dueCandidates = candidates
    .filter((candidate) => candidate && candidate.dueNow)
    .sort((left, right) => left.dueAt - right.dueAt);

  if (!dueCandidates.length) return null;

  const primary = dueCandidates[0];
  const grouped = candidates
    .filter((candidate) => candidate)
    .filter((candidate) => candidate.dueAt - primary.dueAt <= mergeWindowMs && candidate.dueAt >= primary.dueAt);

  return grouped.length ? grouped : [primary];
};

const buildNotificationPayload = (group) => {
  if (group.length === 1) {
    const candidate = group[0];
    const time = formatReminderTime(candidate.milkAt);

    return {
      title: `${candidate.displayName}のミルク確認タイミングです`,
      body: `前回は ${time} です`,
      tag: `milk-reminder-${candidate.babyId}-${candidate.eventId}`,
      url: "/",
    };
  }

  const body = group
    .map((candidate) => {
      const time = formatReminderTime(candidate.milkAt);
      return `${candidate.displayName}: 前回 ${time}`;
    })
    .join("\n");

  return {
    title: "ミルクの確認タイミングです",
    body,
    tag: `milk-reminder-${group.map((candidate) => candidate.babyId).join("-")}`,
    url: "/",
  };
};

const sendPushToDevices = async (uid, devices, payload) => {
  const tasks = devices.map(async (device) => {
    try {
      await webpush.sendNotification(device.subscription, JSON.stringify(payload));
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

exports.sendMilkReminderNotifications = onSchedule("every 5 minutes", async () => {
  if (!publicKey || !privateKey) {
    logger.error("WEB_PUSH_PUBLIC_KEY / WEB_PUSH_PRIVATE_KEY are not configured.");
    return;
  }

  const nowMs = Date.now();
  const usersSnapshot = await db.collection("users").get();

  for (const userDoc of usersSnapshot.docs) {
    const uid = userDoc.id;
    const [appSnap, settingsSnap, devicesSnap] = await Promise.all([
      db.collection("users").doc(uid).collection("app").doc("state").get(),
      db.collection("users").doc(uid).collection("settings").doc("notifications").get(),
      db.collection("users").doc(uid).collection("devices").where("notificationsEnabled", "==", true).get(),
    ]);

    if (!appSnap.exists || devicesSnap.empty) continue;

    const settings = settingsSnap.exists ? settingsSnap.data() : {};
    const milkReminder = settings?.milkReminder ?? {};
    if (milkReminder.enabled === false) continue;

    const appState = appSnap.data()?.app;
    if (!appState) continue;

    const lastSentByBaby = milkReminder.lastSentByBaby ?? {};
    const candidates = ["A", "B"]
      .map((babyId) => buildLatestMilkCandidate({ appState, babyId, lastSentByBaby, nowMs }))
      .filter(Boolean);

    const notificationGroup = groupCandidatesForNotification(candidates, nowMs);
    if (!notificationGroup) continue;

    const devices = devicesSnap.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .filter((device) => device.subscription?.endpoint && device.subscription?.keys?.auth && device.subscription?.keys?.p256dh);

    if (!devices.length) continue;

    const payload = buildNotificationPayload(notificationGroup);
    const sent = await sendPushToDevices(uid, devices, payload);

    if (!sent) continue;

    const nextLastSentByBaby = { ...lastSentByBaby };
    for (const candidate of notificationGroup) {
      nextLastSentByBaby[candidate.babyId] = {
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
          milkReminder: {
            enabled: true,
            intervalMinutes,
            mergeWindowMinutes,
            lastSentByBaby: nextLastSentByBaby,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  }
});

exports.recordFromWear = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const token = req.body?.token;
  const transcript = String(req.body?.text || "").trim();
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
    const appRef = db.collection("users").doc(uid).collection("app").doc("state");
    const appSnap = await appRef.get();
    const appState = appSnap.exists ? appSnap.data()?.app : null;
    const profiles = appState?.profiles || {};
    const defaultMilkMlByBaby = getDefaultMilkMlByBaby(appState?.events);
    const now = new Date();
    const parsed =
      (await parseVoiceTextWithGemini({ text: transcript, profiles, defaultMilkMlByBaby, now })) ||
      parseVoiceTextWithRules({ text: transcript, profiles, defaultMilkMlByBaby, now });

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
