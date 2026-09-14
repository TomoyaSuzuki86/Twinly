from pathlib import Path

path = Path("functions/index.js")
text = path.read_text()

require_anchor = 'const { stockAlerts } = require("./stock-alerts");\n'
require_line = 'const { buildCareNotificationPayload, buildSleepReminderCandidate } = require("./care-reminders");\n'
if require_line not in text:
    if require_anchor not in text:
        raise SystemExit("require anchor not found")
    text = text.replace(require_anchor, require_anchor + require_line, 1)

payload_start = text.find("const buildNotificationPayload = (group) => {")
send_start = text.find("const sendPushToDevices = async (uid, devices, payload) => {", payload_start)
if payload_start == -1 or send_start == -1:
    raise SystemExit("legacy notification payload block not found")
text = text[:payload_start] + text[send_start:]

old_candidates = '''    const candidates = ["A", "B"].flatMap((babyId) =>
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
    );'''
new_candidates = '''    const candidates = ["A", "B"].flatMap((babyId) => {
      const careCandidates = ["milk", "diaper"]
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
        .filter(Boolean);
      const sleepCandidate = buildSleepReminderCandidate({
        appState,
        babyId,
        lastSentByKey,
        nowMs,
      });
      return sleepCandidate ? [...careCandidates, sleepCandidate] : careCandidates;
    });'''
if old_candidates not in text:
    raise SystemExit("candidate block not found")
text = text.replace(old_candidates, new_candidates, 1)

old_payload = "    const payload = buildNotificationPayload(notificationGroup);"
new_payload = "    const payload = buildCareNotificationPayload(notificationGroup, nowMs);"
if old_payload not in text:
    raise SystemExit("payload call not found")
text = text.replace(old_payload, new_payload, 1)

for forbidden in (
    "ゲージが空になりました",
    "ケアゲージが空になりました",
    "buildNotificationPayload(notificationGroup)",
):
    if forbidden in text:
        raise SystemExit(f"legacy notification copy still remains: {forbidden}")

path.write_text(text)
