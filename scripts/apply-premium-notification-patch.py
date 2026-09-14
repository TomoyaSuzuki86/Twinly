from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}: {old[:100]!r}")
    file_path.write_text(text.replace(old, new, 1))


# Explicit Premium feature flag shared by backend and frontend types.
replace_once(
    "functions/ai-policy.js",
    "['aiReview','aiChat','dailySummaryEmail','themes','gauges','stockForecast','stockNotifications','familySharing','music']",
    "['aiReview','aiChat','dailySummaryEmail','themes','gauges','careNotifications','stockForecast','stockNotifications','familySharing','music']",
)
replace_once(
    "src/lib/ai.ts",
    "    gauges?: boolean;\n    stockForecast?: boolean;",
    "    gauges?: boolean;\n    careNotifications?: boolean;\n    stockForecast?: boolean;",
)

# Never send care reminders to Free families, including stale device subscriptions after downgrade.
replace_once(
    "functions/index.js",
    "    const careReminder = settings?.careReminder ?? {};\n    if (careReminder.enabled === false || milkReminder.enabled === false) continue;\n\n    let appState;",
    "    const careReminder = settings?.careReminder ?? {};\n    if (careReminder.enabled === false || milkReminder.enabled === false) continue;\n\n    if (!familyId) continue;\n    let access;\n    try { access = await familyAccess(familyId); }\n    catch (error) { logger.warn(\"Reminder access unavailable\", { uid, familyId, message: error.message }); continue; }\n    if (!access.features.careNotifications) continue;\n\n    let appState;",
)
replace_once(
    "functions/index.js",
    "    if (familyId && (await familyAccess(familyId)).features.stockNotifications) {",
    "    if (access.features.stockNotifications) {",
)

# Free users should not see the notifications tab at all.
replace_once(
    "src/components/SettingsModal.tsx",
    "            <DialogComponents.DialogDescription>\n              プロフィール、通知、データ、デザイン、料金とプランをまとめて管理できます。\n            </DialogComponents.DialogDescription>",
    "            <DialogComponents.DialogDescription>\n              {premiumGaugesEnabled\n                ? \"プロフィール、通知、データ、デザイン、料金とプランをまとめて管理できます。\"\n                : \"プロフィール、データ、デザイン、料金とプランをまとめて管理できます。\"}\n            </DialogComponents.DialogDescription>",
)
replace_once(
    "src/components/SettingsModal.tsx",
    "              <TabsTrigger value=\"notifications\">通知</TabsTrigger>",
    "              {premiumGaugesEnabled ? <TabsTrigger value=\"notifications\">通知</TabsTrigger> : null}",
)

settings_path = Path("src/components/SettingsModal.tsx")
settings = settings_path.read_text()
start_marker = '            <TabsContent value="notifications" className="mt-4 space-y-4">'
end_marker = '            <TabsContent value="data" className="mt-4 space-y-4">'
start = settings.find(start_marker)
end = settings.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit("SettingsModal: notifications block markers not found")
block = settings[start:end].rstrip()
indented = "\n".join("  " + line for line in block.splitlines())
wrapped = "            {premiumGaugesEnabled ? (\n" + indented + "\n            ) : null}\n\n"
settings_path.write_text(settings[:start] + wrapped + settings[end:])

# Pricing copy: make care timing notifications a distinct Premium benefit.
replace_once(
    "src/components/AiTools.tsx",
    "  {\n    icon: PackageSearch,\n    title: \"おむつ在庫切れ予測\",",
    "  {\n    icon: BellRing,\n    title: \"お世話タイミング通知\",\n    description:\n      \"ミルク・おむつのゲージが空になるタイミングをプッシュ通知でお知らせ。Twinlyを開いていないときも“そろそろ”が届くので、次のお世話を頭の中で覚え続ける負担を減らせます。\",\n  },\n  {\n    icon: PackageSearch,\n    title: \"おむつ在庫切れ予測\",",
)
replace_once(
    "src/components/AiTools.tsx",
    '  ["各種お世話ゲージ", false, true],\n  ["AIアドバイス・AI質問", false, true],',
    '  ["各種お世話ゲージ", false, true],\n  ["お世話タイミング通知", false, true],\n  ["AIアドバイス・AI質問", false, true],',
)
image_anchor = '''          <figure className="my-4 overflow-hidden rounded-xl bg-white">
            <img
              src="/premium/care-gauge-notice.webp"
              alt="Twinlyのお世話ゲージを見て、そろそろミルクの時間だと気づく様子"
              width={600}
              height={800}
              loading="lazy"
              decoding="async"
              className="block h-auto w-full"
            />
          </figure>'''
image_with_copy = image_anchor + '''
          <p>
            さらに、ミルクやおむつのゲージが空になるタイミングは通知でも届きます。Twinlyを開いて確認しにいかなくても、「そろそろ」の瞬間をスマホ側から知らせてくれるので、2人分のお世話の時間を頭の中でずっと覚えておく必要がありません。
          </p>
          <p>
            ゲージで「見ればわかる」だけでなく、通知で「見なくてもわかる」。この組み合わせで、スマホを開くことすら意識せず、次に必要なお世話へ自然に動けるようになりました。
          </p>'''
replace_once("src/components/AiTools.tsx", image_anchor, image_with_copy)

# Frontend tests lock the Free/Premium tab behavior and the new benefit copy.
replace_once(
    "src/components/SettingsModal.test.tsx",
    '  it("organizes settings into profile, notifications, data, design and pricing tabs", () => {\n    renderSettings();\n    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([\n      "プロフィール",\n      "通知",\n      "データ管理",\n      "デザイン",\n      "料金とプラン",\n    ]);',
    '  it("hides the notifications tab for Free users", () => {\n    renderSettings();\n    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([\n      "プロフィール",\n      "データ管理",\n      "デザイン",\n      "料金とプラン",\n    ]);\n    expect(screen.queryByRole("tab", { name: "通知" })).toBeNull();',
)
replace_once(
    "src/components/SettingsModal.test.tsx",
    '  it("allows activity limits to be overridden and restored to the age default", () => {',
    '  it("shows the notifications tab for Premium users", () => {\n    renderSettings(undefined, true);\n    expect(screen.getByRole("tab", { name: "通知" })).toBeInTheDocument();\n  });\n\n  it("allows activity limits to be overridden and restored to the age default", () => {',
)
replace_once(
    "src/components/AiTools.test.tsx",
    "    expect(screen.getByText('2人分のお世話ゲージ')).toBeInTheDocument();\n    expect(screen.getByText('おむつ在庫切れ予測')).toBeInTheDocument();",
    "    expect(screen.getByText('2人分のお世話ゲージ')).toBeInTheDocument();\n    expect(screen.getByText('お世話タイミング通知')).toBeInTheDocument();\n    expect(screen.getByText('おむつ在庫切れ予測')).toBeInTheDocument();",
)

# Policy test ensures the backend entitlement cannot accidentally become Free.
replace_once(
    "functions/test/ai-policy.test.js",
    "  assert.equal(accessFor({previewPlan:'premium'},true).features.dailySummaryEmail,true);",
    "  assert.equal(accessFor({previewPlan:'premium'},true).features.dailySummaryEmail,true);\n  assert.equal(accessFor().features.careNotifications,false);\n  assert.equal(accessFor({previewPlan:'premium'},true).features.careNotifications,true);",
)
