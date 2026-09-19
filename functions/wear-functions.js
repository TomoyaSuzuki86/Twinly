const crypto = require("crypto");
const { readApp, writeApp, assertWritable } = require("./app-storage");
const { onRequest } = require("firebase-functions/v2/https");
const { parseVoiceTextWithRules, projectWearEvents } = require("./wear-parser");

const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const normalizeWearToken = (token) => String(token || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
const hashWearToken = (token) => crypto.createHash("sha256").update(normalizeWearToken(token)).digest("hex");
const createEventId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

module.exports = ({ admin, db, getAppRefForUid, logger }) => {
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
  
  
  const appendWearEvent = async ({ uid, transcript, parsed }) => {
    const appRef = await getAppRefForUid(uid);
    const events = projectWearEvents({
      uid,
      transcript,
      parsed,
      idFactory: createEventId,
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

  const recordFromWear = onRequest({ cors: true }, async (req, res) => {
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
  
  const undoWearRecord = onRequest({ cors: true }, async (req, res) => {
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
  
  const latestMilkElapsedFromWear = onRequest({ cors: true }, async (req, res) => {
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

  return { recordFromWear, undoWearRecord, latestMilkElapsedFromWear };
};
