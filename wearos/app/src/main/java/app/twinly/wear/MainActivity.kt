package app.twinly.wear

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognizerIntent
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

private const val PREFS_NAME = "twinly-wear"
private const val TOKEN_KEY = "pairing-token"
private const val RECORD_URL = "https://asia-northeast1-twinly-prod.cloudfunctions.net/recordFromWear"

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            TwinlyWearApp()
        }
    }
}

@Composable
fun TwinlyWearApp() {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE) }
    val scope = rememberCoroutineScope()
    var token by remember { mutableStateOf(prefs.getString(TOKEN_KEY, "") ?: "") }
    var status by remember { mutableStateOf("Twinly") }
    var lastTranscript by remember { mutableStateOf("") }
    var launchedOnOpen by remember { mutableStateOf(false) }

    val voiceLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode != Activity.RESULT_OK) {
            status = "聞き取れませんでした"
            return@rememberLauncherForActivityResult
        }

        val transcript = result.data
            ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
            ?.firstOrNull()
            ?.trim()
            .orEmpty()

        if (transcript.isBlank()) {
            status = "聞き取れませんでした"
            return@rememberLauncherForActivityResult
        }

        lastTranscript = transcript
        status = "保存中..."
        scope.launch {
            status = postRecord(token, transcript)
        }
    }

    fun startVoiceInput() {
        if (token.isBlank()) {
            status = "連携キーを入れてください"
            return
        }

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ja-JP")
            putExtra(RecognizerIntent.EXTRA_PROMPT, "例: ひなたが5分前にミルク80ml")
        }
        voiceLauncher.launch(intent)
    }

    LaunchedEffect(token) {
        if (!launchedOnOpen && token.isNotBlank()) {
            launchedOnOpen = true
            startVoiceInput()
        }
    }

    MaterialTheme {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF050816))
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = status,
                color = Color.White,
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.titleMedium,
            )
            if (lastTranscript.isNotBlank()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = lastTranscript,
                    color = Color(0xFFBAE6FD),
                    textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
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
            Spacer(modifier = Modifier.height(12.dp))
            Button(onClick = { startVoiceInput() }, modifier = Modifier.fillMaxWidth()) {
                Text("音声入力")
            }
        }
    }
}

private suspend fun postRecord(token: String, transcript: String): String = withContext(Dispatchers.IO) {
    val connection = (URL(RECORD_URL).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        setRequestProperty("Content-Type", "application/json; charset=utf-8")
        connectTimeout = 10_000
        readTimeout = 10_000
        doOutput = true
    }

    val body = """{"token":"${escapeJson(token)}","text":"${escapeJson(transcript)}"}"""
    OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer ->
        writer.write(body)
    }

    val responseCode = connection.responseCode
    connection.disconnect()

    when (responseCode) {
        in 200..299 -> "保存しました"
        401 -> "連携キーが違います"
        422 -> "内容を解釈できませんでした"
        else -> "保存に失敗しました"
    }
}

private fun escapeJson(value: String): String =
    value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")
