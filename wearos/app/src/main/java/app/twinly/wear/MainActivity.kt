package app.twinly.wear

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

private const val PREFS_NAME = "twinly-wear"
private const val TOKEN_KEY = "pairing-token"
private const val RECORD_URL = "https://asia-northeast1-twinly-prod.cloudfunctions.net/recordFromWear"
private const val UNDO_URL = "https://asia-northeast1-twinly-prod.cloudfunctions.net/undoWearRecord"
private const val FINAL_RESULT_FALLBACK_MS = 1_200L
const val EXTRA_FORCED_BABY_ID = "app.twinly.wear.extra.FORCED_BABY_ID"

data class WearPostResult(
    val ok: Boolean,
    val message: String,
    val eventIds: List<String> = emptyList(),
)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val forcedBabyId = intent.getStringExtra(EXTRA_FORCED_BABY_ID)?.takeIf { it == "A" || it == "B" }
        setContent {
            TwinlyWearApp(initialForcedBabyId = forcedBabyId)
        }
    }
}

@Composable
fun TwinlyWearApp(initialForcedBabyId: String? = null) {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE) }
    val scope = rememberCoroutineScope()
    var token by remember { mutableStateOf(prefs.getString(TOKEN_KEY, "") ?: "") }
    var transientMessage by remember { mutableStateOf("") }
    var lastTranscript by remember { mutableStateOf("") }
    var lastEventIds by remember { mutableStateOf<List<String>>(emptyList()) }
    var lastTranscriptSaved by remember { mutableStateOf(false) }
    var listening by remember { mutableStateOf(false) }
    var launchedOnOpen by remember { mutableStateOf(false) }
    var latestTranscript by remember { mutableStateOf("") }
    var submitted by remember { mutableStateOf(false) }
    var silenceJob by remember { mutableStateOf<Job?>(null) }

    val speechRecognizer = remember { SpeechRecognizer.createSpeechRecognizer(context) }
    val recognizerIntent = remember {
        Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ja-JP")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1_000L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1_000L)
        }
    }

    fun stopSilenceTimer() {
        silenceJob?.cancel()
        silenceJob = null
    }

    fun submitTranscript(transcript: String) {
        val cleanTranscript = transcript.trim()
        if (submitted || cleanTranscript.isBlank()) return

        submitted = true
        listening = false
        stopSilenceTimer()
        speechRecognizer.stopListening()

        lastEventIds = emptyList()
        lastTranscriptSaved = false
        transientMessage = ""
        scope.launch {
            val result = postRecord(token, cleanTranscript, initialForcedBabyId)
            lastTranscript = cleanTranscript
            if (result.ok) {
                lastEventIds = result.eventIds
                lastTranscriptSaved = true
                transientMessage = ""
                requestComplicationRefresh(context)
            } else {
                lastEventIds = emptyList()
                lastTranscriptSaved = false
                transientMessage = result.message
            }
        }
    }

    fun startVoiceInput() {
        if (token.isBlank()) {
            transientMessage = "連携キーを入れてください"
            return
        }

        val hasMicPermission =
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        if (!hasMicPermission) return

        submitted = false
        latestTranscript = ""
        stopSilenceTimer()
        transientMessage = ""
        listening = true
        speechRecognizer.startListening(recognizerIntent)
    }

    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            startVoiceInput()
        } else {
            transientMessage = "マイク権限が必要です"
        }
    }

    fun ensurePermissionAndStart() {
        val hasMicPermission =
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        if (hasMicPermission) {
            startVoiceInput()
        } else {
            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    DisposableEffect(speechRecognizer) {
        val listener = object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) = Unit
            override fun onBeginningOfSpeech() = Unit
            override fun onRmsChanged(rmsdB: Float) = Unit
            override fun onBufferReceived(buffer: ByteArray?) = Unit
            override fun onEndOfSpeech() {
                if (latestTranscript.isBlank()) return
                stopSilenceTimer()
                silenceJob = scope.launch {
                    delay(FINAL_RESULT_FALLBACK_MS)
                    submitTranscript(latestTranscript)
                }
            }

            override fun onError(error: Int) {
                listening = false
                stopSilenceTimer()
                if (!submitted) transientMessage = "聞き取れませんでした"
            }

            override fun onResults(results: Bundle?) {
                stopSilenceTimer()
                val transcript = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    .orEmpty()
                submitTranscript(transcript.ifBlank { latestTranscript })
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val transcript = partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    .orEmpty()
                if (transcript.isNotBlank()) latestTranscript = transcript.trim()
            }

            override fun onEvent(eventType: Int, params: Bundle?) = Unit
        }

        speechRecognizer.setRecognitionListener(listener)

        onDispose {
            stopSilenceTimer()
            speechRecognizer.destroy()
        }
    }

    LaunchedEffect(token) {
        if (!launchedOnOpen && token.isNotBlank()) {
            launchedOnOpen = true
            delay(250)
            ensurePermissionAndStart()
        }
    }

    MaterialTheme {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF050816))
                .padding(14.dp),
        ) {
            Column(
                modifier = Modifier.align(Alignment.Center),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Button(
                    onClick = { ensurePermissionAndStart() },
                    modifier = Modifier.size(72.dp),
                    shape = CircleShape,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (listening) Color(0xFF38BDF8) else Color(0xFF1E293B),
                        contentColor = Color.White,
                    ),
                    contentPadding = PaddingValues(0.dp),
                ) {
                    if (initialForcedBabyId != null) {
                        Text(
                            text = initialForcedBabyId,
                            color = Color.White,
                            style = MaterialTheme.typography.headlineMedium,
                        )
                    } else {
                        Icon(
                            painter = painterResource(id = R.drawable.ic_complication_voice),
                            contentDescription = "音声入力",
                            modifier = Modifier.size(34.dp),
                        )
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                if (lastTranscript.isNotBlank()) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(
                            modifier = Modifier.weight(1f, fill = false),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            if (transientMessage.isNotBlank()) {
                                Text(
                                    text = transientMessage,
                                    color = Color(0xFFFCA5A5),
                                    textAlign = TextAlign.Center,
                                    overflow = TextOverflow.Ellipsis,
                                    maxLines = 1,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                            Text(
                                text = lastTranscript,
                                color = if (lastTranscriptSaved) Color(0xFFBAE6FD) else Color(0xFFCBD5E1),
                                textAlign = TextAlign.Center,
                                overflow = TextOverflow.Ellipsis,
                                maxLines = 2,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        IconButton(
                            onClick = {
                                val deletingEventIds = lastEventIds
                                lastTranscript = ""
                                lastEventIds = emptyList()
                                lastTranscriptSaved = false
                                transientMessage = ""
                                if (deletingEventIds.isNotEmpty()) {
                                    scope.launch {
                                        transientMessage = undoRecord(token, deletingEventIds)
                                        requestComplicationRefresh(context)
                                    }
                                }
                            },
                            modifier = Modifier.size(36.dp),
                        ) {
                            Icon(
                                painter = painterResource(id = R.drawable.ic_trash),
                                contentDescription = "直前の記録を削除",
                                modifier = Modifier.size(20.dp),
                                tint = Color.White,
                            )
                        }
                    }
                } else if (transientMessage.isNotBlank()) {
                    Text(
                        text = transientMessage,
                        color = Color(0xFFCBD5E1),
                        textAlign = TextAlign.Center,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }

            if (token.isBlank()) {
                Column(
                    modifier = Modifier.align(Alignment.BottomCenter),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    OutlinedTextField(
                        value = token,
                        onValueChange = {
                            token = it.uppercase()
                            prefs.edit().putString(TOKEN_KEY, token).apply()
                        },
                        label = { Text("連携キー") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }
}

private suspend fun postRecord(token: String, transcript: String, forcedBabyId: String? = null): WearPostResult = withContext(Dispatchers.IO) {
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

private suspend fun undoRecord(token: String, eventIds: List<String>): String = withContext(Dispatchers.IO) {
    val ids = eventIds.joinToString(",") { "\"${escapeJson(it)}\"" }
    val response = postJson(UNDO_URL, """{"token":"${escapeJson(token)}","eventIds":[$ids]}""")

    when (response.code) {
        in 200..299 -> "削除しました"
        401 -> "連携キーが違います"
        else -> "削除に失敗しました"
    }
}

private fun requestComplicationRefresh(context: Context) {
    runCatching {
        ComplicationDataSourceUpdateRequester.create(
            context,
            ComponentName(context, TwinlyVoiceComplicationService::class.java),
        ).requestUpdateAll()
        ComplicationDataSourceUpdateRequester.create(
            context,
            ComponentName(context, TwinlyVoiceAComplicationService::class.java),
        ).requestUpdateAll()
        ComplicationDataSourceUpdateRequester.create(
            context,
            ComponentName(context, TwinlyVoiceBComplicationService::class.java),
        ).requestUpdateAll()
    }
}

data class HttpJsonResponse(val code: Int, val body: String)

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
