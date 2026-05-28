package app.twinly.wear

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.MonochromaticImage
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

private const val PREFS_NAME = "twinly-wear"
private const val TOKEN_KEY = "pairing-token"
private const val CACHED_TEXT_KEY = "cached-milk-text"
private const val LATEST_MILK_URL = "https://asia-northeast1-twinly-prod.cloudfunctions.net/latestMilkElapsedFromWear"
private const val LATEST_MILK_DATA_PATH = "/latest_milk_elapsed"

open class TwinlyVoiceComplicationService : SuspendingComplicationDataSourceService() {
    protected open val forcedBabyId: String? = null

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
        if (request.complicationType != ComplicationType.SHORT_TEXT) return null
        val latestMilk = fetchLatestMilkFromDataLayer()
            ?: fetchLatestMilkElapsedText()
            ?: getCachedLatestMilkElapsedText()
        return buildVoiceShortcutData(latestMilk)
    }

    override fun getPreviewData(type: ComplicationType): ComplicationData? {
        if (type != ComplicationType.SHORT_TEXT) return null
        val preview = buildMilkElapsedText(elapsedA = 45, elapsedB = 182, targetBabyId = forcedBabyId)
            ?: MilkElapsedText(
                textLine = "A:45m",
                titleLine = "B:182m",
                contentDescription = "Twinly A 45 minutes, B 182 minutes since milk",
            )
        return buildVoiceShortcutData(preview)
    }

    private fun buildVoiceShortcutData(latestMilk: MilkElapsedText?): ShortTextComplicationData {
        val text = PlainComplicationText.Builder(latestMilk?.textLine ?: forcedBabyId ?: "Twinly").build()
        val description = PlainComplicationText.Builder(
            latestMilk?.contentDescription ?: forcedBabyId?.let { "Twinly voice input for baby $it" } ?: "Twinly voice input"
        ).build()
        val tapIntent = Intent(this, MainActivity::class.java).apply {
            action = ACTION_START_VOICE
            forcedBabyId?.let { putExtra(EXTRA_FORCED_BABY_ID, it) }
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val tapAction = PendingIntent.getActivity(
            this,
            forcedBabyId?.hashCode() ?: 0,
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val icon = MonochromaticImage.Builder(
            Icon.createWithResource(this, R.drawable.ic_complication_twinly)
        ).build()

        return ShortTextComplicationData.Builder(
            text = text,
            contentDescription = description,
        )
            .apply {
                if (latestMilk?.titleLine != null) {
                    setTitle(PlainComplicationText.Builder(latestMilk.titleLine).build())
                }
            }
            .setMonochromaticImage(icon)
            .setTapAction(tapAction)
            .build()
    }

    private suspend fun fetchLatestMilkFromDataLayer(): MilkElapsedText? = withContext(Dispatchers.IO) {
        runCatching {
            val dataItems = Wearable.getDataClient(this@TwinlyVoiceComplicationService)
                .dataItems
                .await()
            dataItems.use { buffer ->
                buffer
                    .asSequence()
                    .filter { it.uri.path == LATEST_MILK_DATA_PATH }
                    .mapNotNull { item ->
                        val dataMap = DataMapItem.fromDataItem(item).dataMap
                        val nowMs = System.currentTimeMillis()
                        val elapsedA = dataMap.getLong("milkAtA", -1).takeIf { it > 0 }?.let { elapsedMinutesSince(it, nowMs) }
                            ?: dataMap.getInt("elapsedA", -1).takeIf { it >= 0 }
                        val elapsedB = dataMap.getLong("milkAtB", -1).takeIf { it > 0 }?.let { elapsedMinutesSince(it, nowMs) }
                            ?: dataMap.getInt("elapsedB", -1).takeIf { it >= 0 }
                        buildMilkElapsedText(elapsedA, elapsedB, forcedBabyId)
                    }
                    .firstOrNull()
            }
        }.getOrNull()?.also { cacheLatestMilkElapsedText(it) }
    }

    private suspend fun fetchLatestMilkElapsedText(): MilkElapsedText? = withContext(Dispatchers.IO) {
        val token = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(TOKEN_KEY, "") ?: ""
        if (token.isBlank()) return@withContext null

        runCatching {
            val encodedToken = URLEncoder.encode(token, Charsets.UTF_8.name())
            val connection = (URL("$LATEST_MILK_URL?token=$encodedToken").openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 4_000
                readTimeout = 4_000
            }

            val responseCode = connection.responseCode
            val body = runCatching {
                val stream = if (responseCode in 200..299) connection.inputStream else connection.errorStream
                stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            }.getOrDefault("")
            connection.disconnect()

            if (responseCode !in 200..299) return@runCatching null

            val elapsedByBaby = JSONObject(body).optJSONObject("elapsedByBaby") ?: return@runCatching null
            val elapsedA = elapsedByBaby.optJSONObject("A")?.optInt("elapsedMinutes", -1)?.takeIf { it >= 0 }
            val elapsedB = elapsedByBaby.optJSONObject("B")?.optInt("elapsedMinutes", -1)?.takeIf { it >= 0 }
            buildMilkElapsedText(elapsedA, elapsedB, forcedBabyId)?.also { cacheLatestMilkElapsedText(it) }
        }.getOrNull()
    }

    private fun buildMilkElapsedText(elapsedA: Int?, elapsedB: Int?, targetBabyId: String?): MilkElapsedText? {
        if (targetBabyId == "A") {
            return elapsedA?.let {
                MilkElapsedText(
                    textLine = "A:${it}m",
                    titleLine = null,
                    contentDescription = "Twinly A $it minutes since milk",
                )
            }
        }
        if (targetBabyId == "B") {
            return elapsedB?.let {
                MilkElapsedText(
                    textLine = "B:${it}m",
                    titleLine = null,
                    contentDescription = "Twinly B $it minutes since milk",
                )
            }
        }
        if (elapsedA == null && elapsedB == null) return null

        val items = listOfNotNull(
            elapsedA?.let { MilkElapsedLine("A", it) },
            elapsedB?.let { MilkElapsedLine("B", it) },
        )
        val titleItem = items.maxWithOrNull(
            compareBy<MilkElapsedLine> { it.elapsedMinutes }
                .thenBy { if (it.babyId == "A") 1 else 0 }
        ) ?: return null
        val textItem = items.firstOrNull { it.babyId != titleItem.babyId }

        return MilkElapsedText(
            textLine = textItem?.line ?: titleItem.line,
            titleLine = if (textItem != null) titleItem.line else null,
            contentDescription = items.joinToString(", ") { it.line },
        )
    }

    private fun elapsedMinutesSince(timestamp: Long, nowMs: Long): Int =
        ((nowMs - timestamp).coerceAtLeast(0) / 60_000L).toInt()

    private fun cacheLatestMilkElapsedText(latestMilk: MilkElapsedText) {
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(
                cacheTextKey(),
                JSONObject()
                    .put("textLine", latestMilk.textLine)
                    .put("titleLine", latestMilk.titleLine)
                    .put("contentDescription", latestMilk.contentDescription)
                    .toString(),
            )
            .apply()
    }

    private fun getCachedLatestMilkElapsedText(): MilkElapsedText? =
        runCatching {
            val raw = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(cacheTextKey(), "") ?: ""
            if (raw.isBlank()) return@runCatching null
            val json = JSONObject(raw)
            MilkElapsedText(
                textLine = json.optString("textLine").takeIf { it.isNotBlank() } ?: return@runCatching null,
                titleLine = json.optString("titleLine").takeIf { it.isNotBlank() },
                contentDescription = json.optString("contentDescription").takeIf { it.isNotBlank() } ?: "Twinly milk elapsed",
            )
        }.getOrNull()

    private fun cacheTextKey(): String = forcedBabyId?.let { "$CACHED_TEXT_KEY-$it" } ?: CACHED_TEXT_KEY

    companion object {
        const val ACTION_START_VOICE = "app.twinly.wear.action.START_VOICE"
    }
}

class TwinlyVoiceAComplicationService : TwinlyVoiceComplicationService() {
    override val forcedBabyId: String = "A"
}

class TwinlyVoiceBComplicationService : TwinlyVoiceComplicationService() {
    override val forcedBabyId: String = "B"
}

data class MilkElapsedText(
    val textLine: String,
    val titleLine: String?,
    val contentDescription: String,
)

data class MilkElapsedLine(
    val babyId: String,
    val elapsedMinutes: Int,
) {
    val line: String = "$babyId:${elapsedMinutes}m"
}
