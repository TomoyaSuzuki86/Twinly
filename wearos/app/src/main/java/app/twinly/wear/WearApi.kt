package app.twinly.wear

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

private const val RECORD_URL = "https://asia-northeast1-twinly-prod.cloudfunctions.net/recordFromWear"
private const val UNDO_URL = "https://asia-northeast1-twinly-prod.cloudfunctions.net/undoWearRecord"

data class WearPostResult(
    val ok: Boolean,
    val message: String,
    val eventIds: List<String> = emptyList(),
)

internal suspend fun postRecord(
    token: String,
    transcript: String,
    forcedBabyId: String? = null,
): WearPostResult = withContext(Dispatchers.IO) {
    val body = JSONObject()
        .put("token", token)
        .put("text", transcript)
        .apply { forcedBabyId?.let { put("forcedBabyId", it) } }
        .toString()
    val response = postJson(RECORD_URL, body)
    val eventIds = if (response.code in 200..299) {
        runCatching {
            val events = JSONObject(response.body).optJSONArray("events")
            List(events?.length() ?: 0) { index -> events!!.optJSONObject(index)?.optString("id").orEmpty() }
                .filter { it.isNotBlank() }
        }.getOrDefault(emptyList())
    } else {
        emptyList()
    }

    WearPostResult(
        ok = response.code in 200..299,
        message = when (response.code) {
            in 200..299 -> "保存しました"
            401 -> "連携キーが違います"
            422 -> "内容を解釈できませんでした"
            else -> "保存に失敗しました"
        },
        eventIds = eventIds,
    )
}

internal suspend fun undoRecord(token: String, eventIds: List<String>): String = withContext(Dispatchers.IO) {
    val ids = eventIds.joinToString(",") { "\"${escapeJson(it)}\"" }
    val response = postJson(UNDO_URL, """{"token":"${escapeJson(token)}","eventIds":[$ids]}""")

    when (response.code) {
        in 200..299 -> "削除しました"
        401 -> "連携キーが違います"
        else -> "削除に失敗しました"
    }
}

private data class HttpJsonResponse(val code: Int, val body: String)

private fun postJson(url: String, body: String): HttpJsonResponse {
    val connection = (URL(url).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        setRequestProperty("Content-Type", "application/json; charset=utf-8")
        connectTimeout = 10_000
        readTimeout = 10_000
        doOutput = true
    }

    OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer ->
        writer.write(body)
    }

    val responseCode = connection.responseCode
    val responseBody = runCatching {
        val stream = if (responseCode in 200..299) connection.inputStream else connection.errorStream
        stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
    }.getOrDefault("")
    connection.disconnect()

    return HttpJsonResponse(responseCode, responseBody)
}

private fun escapeJson(value: String): String =
    value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")
