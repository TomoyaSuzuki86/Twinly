package app.twinly.companion

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
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
import androidx.compose.material3.ButtonDefaults
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

private const val PREFS_NAME = "twinly-companion"
private const val TOKEN_KEY = "pairing-token"
private const val PERIODIC_SYNC_WORK_NAME = "latest-milk-to-watch"
private const val LATEST_MILK_URL = "https://asia-northeast1-twinly-prod.cloudfunctions.net/latestMilkElapsedFromWear"
private const val LATEST_MILK_DATA_PATH = "/latest_milk_elapsed"

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            TwinlyCompanionApp()
        }
    }
}

@Composable
fun TwinlyCompanionApp() {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE) }
    val scope = rememberCoroutineScope()
    var token by remember { mutableStateOf(prefs.getString(TOKEN_KEY, "") ?: "") }
    var busy by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf("Enter the Watch link key, then sync.") }
    var lastText by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        if (token.isNotBlank()) schedulePeriodicMilkSync(context)
    }

    MaterialTheme {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFFF8FAFC))
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = "Twinly Companion",
                color = Color(0xFF0F172A),
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.headlineMedium,
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = status,
                color = Color(0xFF475569),
                style = MaterialTheme.typography.bodyMedium,
            )
            if (lastText.isNotBlank()) {
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = lastText,
                    color = Color(0xFF0369A1),
                    fontWeight = FontWeight.SemiBold,
                    style = MaterialTheme.typography.titleMedium,
                )
            }
            Spacer(modifier = Modifier.height(22.dp))
            OutlinedTextField(
                value = token,
                onValueChange = {
                    token = it.uppercase()
                    prefs.edit().putString(TOKEN_KEY, token).apply()
                },
                label = { Text("Watch link key") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = {
                    if (token.isBlank()) {
                        status = "Enter the Watch link key."
                        return@Button
                    }
                    busy = true
                    status = "Syncing..."
                    scope.launch {
                        val result = syncLatestMilkElapsed(context, token)
                        busy = false
                        status = result.message
                        lastText = result.displayText
                        if (result.ok) schedulePeriodicMilkSync(context)
                    }
                },
                enabled = !busy,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (busy) "Syncing" else "Sync to Watch")
            }
        }
    }
}

class MilkSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters,
) : CoroutineWorker(appContext, workerParams) {
    override suspend fun doWork(): Result {
        val token = applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(TOKEN_KEY, "")
            .orEmpty()

        if (token.isBlank()) return Result.failure()
        val result = syncLatestMilkElapsed(applicationContext, token)
        return if (result.ok) Result.success() else Result.retry()
    }
}

private fun schedulePeriodicMilkSync(context: Context) {
    val request = PeriodicWorkRequestBuilder<MilkSyncWorker>(15, TimeUnit.MINUTES).build()
    WorkManager.getInstance(context).enqueueUniquePeriodicWork(
        PERIODIC_SYNC_WORK_NAME,
        ExistingPeriodicWorkPolicy.UPDATE,
        request,
    )
}

data class SyncResult(
    val ok: Boolean,
    val message: String,
    val displayText: String = "",
)

private suspend fun syncLatestMilkElapsed(context: Context, token: String): SyncResult = withContext(Dispatchers.IO) {
    runCatching {
        val latestMilk = fetchLatestMilkElapsed(token)
        if (latestMilk == null) {
            return@runCatching SyncResult(false, "Could not fetch latest milk times.")
        }

        val request = PutDataMapRequest.create(LATEST_MILK_DATA_PATH).apply {
            dataMap.putLong("milkAtA", latestMilk.milkAtA)
            dataMap.putLong("milkAtB", latestMilk.milkAtB)
            dataMap.putLong("updatedAt", System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()

        Wearable.getDataClient(context).putDataItem(request).await()

        SyncResult(
            ok = true,
            message = "Synced to Watch.",
            displayText = "A:${latestMilk.elapsedA}m / B:${latestMilk.elapsedB}m",
        )
    }.getOrElse {
        SyncResult(false, "Sync failed.")
    }
}

data class LatestMilkElapsed(
    val milkAtA: Long,
    val milkAtB: Long,
    val elapsedA: Int,
    val elapsedB: Int,
)

private fun fetchLatestMilkElapsed(token: String): LatestMilkElapsed? {
    val encodedToken = URLEncoder.encode(token, Charsets.UTF_8.name())
    val connection = (URL("$LATEST_MILK_URL?token=$encodedToken").openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = 8_000
        readTimeout = 8_000
    }

    val responseCode = connection.responseCode
    val body = runCatching {
        val stream = if (responseCode in 200..299) connection.inputStream else connection.errorStream
        stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
    }.getOrDefault("")
    connection.disconnect()

    if (responseCode !in 200..299) return null
    val elapsedByBaby = JSONObject(body).optJSONObject("elapsedByBaby") ?: return null
    val itemA = elapsedByBaby.optJSONObject("A") ?: return null
    val itemB = elapsedByBaby.optJSONObject("B") ?: return null
    val milkAtA = itemA.optLong("milkAt", -1).takeIf { it > 0 } ?: return null
    val milkAtB = itemB.optLong("milkAt", -1).takeIf { it > 0 } ?: return null
    val elapsedA = itemA.optInt("elapsedMinutes", -1).takeIf { it >= 0 } ?: return null
    val elapsedB = itemB.optInt("elapsedMinutes", -1).takeIf { it >= 0 } ?: return null

    return LatestMilkElapsed(milkAtA, milkAtB, elapsedA, elapsedB)
}
