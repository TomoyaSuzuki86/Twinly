package app.twinly.companion

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import kotlinx.coroutines.Dispatchers
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
private const val TWINLY_URL = "https://twinly-prod.web.app"
private const val NOTIFICATION_CHANNEL_ID = "milk-reminders"
private const val MILK_REMINDER_MINUTES = 60
private const val GOOGLE_WEB_CLIENT_ID = "557885702942-6h3fs7om09vddamhd0ohgb51ietnjqnd.apps.googleusercontent.com"
private const val GOOGLE_SIGN_IN_REQUEST_CODE = 8601

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private val googleSignInClient by lazy {
        GoogleSignIn.getClient(
            this,
            GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestIdToken(GOOGLE_WEB_CLIENT_ID)
                .requestEmail()
                .build(),
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        createNotificationChannel(this)
        requestNotificationPermissionIfNeeded()

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            webViewClient = WebViewClient()
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            addJavascriptInterface(TwinlyAndroidBridge(this@MainActivity, this@MainActivity), "TwinlyAndroid")
            loadUrl(TWINLY_URL)
        }

        setContentView(webView)
    }

    fun signInWithGoogle() {
        googleSignInClient.signOut().addOnCompleteListener {
            startActivityForResult(googleSignInClient.signInIntent, GOOGLE_SIGN_IN_REQUEST_CODE)
        }
    }

    @Deprecated("Deprecated by Android, but sufficient for this simple Google sign-in handoff.")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != GOOGLE_SIGN_IN_REQUEST_CODE) return

        val idToken = runCatching {
            GoogleSignIn.getSignedInAccountFromIntent(data)
                .getResult(ApiException::class.java)
                .idToken
        }.getOrNull()

        if (idToken.isNullOrBlank()) return
        val escapedToken = idToken.replace("\\", "\\\\").replace("'", "\\'")
        webView.post {
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('twinlyAndroidGoogleIdToken',{detail:{idToken:'$escapedToken'}}));",
                null,
            )
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < 33) return
        val hasPermission = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (!hasPermission) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1001)
    }
}

class TwinlyAndroidBridge(
    private val context: Context,
    private val activity: MainActivity,
) {
    @JavascriptInterface
    fun saveWearToken(token: String) {
        val normalizedToken = token.replace(Regex("[^a-zA-Z0-9]"), "").uppercase()
        if (normalizedToken.isBlank()) return
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(TOKEN_KEY, normalizedToken)
            .apply()
        schedulePeriodicMilkSync(context)
    }

    @JavascriptInterface
    fun signInWithGoogle() {
        activity.runOnUiThread { activity.signInWithGoogle() }
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
            ?: return@runCatching SyncResult(false, "Could not fetch latest milk times.")

        val request = PutDataMapRequest.create(LATEST_MILK_DATA_PATH).apply {
            dataMap.putLong("milkAtA", latestMilk.milkAtA)
            dataMap.putLong("milkAtB", latestMilk.milkAtB)
            dataMap.putLong("updatedAt", System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()

        Wearable.getDataClient(context).putDataItem(request).await()
        maybeNotifyMilkReminder(context, latestMilk)

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

private fun createNotificationChannel(context: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val manager = context.getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(
        NOTIFICATION_CHANNEL_ID,
        "Milk reminders",
        NotificationManager.IMPORTANCE_DEFAULT,
    )
    manager.createNotificationChannel(channel)
}

private fun maybeNotifyMilkReminder(context: Context, latestMilk: LatestMilkElapsed) {
    val reminders = listOf(
        "A" to latestMilk.elapsedA,
        "B" to latestMilk.elapsedB,
    ).filter { (_, elapsedMinutes) -> elapsedMinutes >= MILK_REMINDER_MINUTES }

    if (reminders.isEmpty()) return
    if (Build.VERSION.SDK_INT >= 33) {
        val hasPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (!hasPermission) return
    }

    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    reminders.forEach { (babyId, elapsedMinutes) ->
        val bucket = elapsedMinutes / MILK_REMINDER_MINUTES
        val key = "notified-$babyId-$bucket"
        if (prefs.getBoolean(key, false)) return@forEach

        val notification = NotificationCompat.Builder(context, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Twinly ミルク通知")
            .setContentText("$babyId は ${elapsedMinutes}分ミルクを飲んでいません")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .build()

        NotificationManagerCompat.from(context).notify(babyId.hashCode() + bucket, notification)
        prefs.edit().putBoolean(key, true).apply()
    }
}
