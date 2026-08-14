package com.strawcoding.strawmoneybook.sync

import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import com.strawcoding.strawmoneybook.protocol.WearNearbyPolicy
import com.strawcoding.strawmoneybook.protocol.WearPaths
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class WearMessageListenerService : WearableListenerService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onMessageReceived(event: MessageEvent) {
        val path = event.path
        if (!WearPaths.isAllowed(path)) return
        scope.launch {
            val nearby = try {
                Wearable.getNodeClient(this@WearMessageListenerService)
                    .connectedNodes
                    .await()
                    .firstOrNull { it.id == event.sourceNodeId }
                    ?.isNearby == true
            } catch (_: Exception) {
                false
            }
            if (!WearNearbyPolicy.maySend(nearby)) return@launch
            val raw = String(event.data ?: ByteArray(0), Charsets.UTF_8)
            val repo = WearSyncRepository(this@WearMessageListenerService)
            when (path) {
                WearPaths.TX_ACK -> repo.handleAck(raw)
                WearPaths.HELLO, WearPaths.SNAPSHOT_PAYLOAD -> repo.handleSnapshotOrHello(raw)
            }
        }
    }
}
