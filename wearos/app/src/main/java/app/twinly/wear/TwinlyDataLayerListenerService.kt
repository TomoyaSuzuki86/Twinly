package app.twinly.wear

import android.content.ComponentName
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.WearableListenerService

private const val LATEST_MILK_DATA_PATH = "/latest_milk_elapsed"

class TwinlyDataLayerListenerService : WearableListenerService() {
    override fun onDataChanged(dataEvents: DataEventBuffer) {
        val hasLatestMilkUpdate = dataEvents.any { event ->
            event.type == DataEvent.TYPE_CHANGED && event.dataItem.uri.path == LATEST_MILK_DATA_PATH
        }
        if (!hasLatestMilkUpdate) return

        runCatching {
            ComplicationDataSourceUpdateRequester.create(
                this,
                ComponentName(this, TwinlyVoiceComplicationService::class.java),
            ).requestUpdateAll()
        }
    }
}
