package com.strawcoding.strawmoneybook

import android.app.Application
import com.google.android.gms.wearable.Wearable
import com.strawcoding.strawmoneybook.protocol.WearPaths
import com.strawcoding.strawmoneybook.sync.WearSyncRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class WearApp : Application() {
    lateinit var syncRepository: WearSyncRepository
        private set

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        syncRepository = WearSyncRepository(this)
        appScope.launch {
            try {
                Wearable.getCapabilityClient(this@WearApp)
                    .addLocalCapability(WearPaths.CAPABILITY_WATCH)
            } catch (_: Exception) {
                // capability optional for unit tests
            }
            try {
                syncRepository.requestHelloAndSnapshot()
                syncRepository.flushPending()
            } catch (_: Exception) {
                // phone may be offline
            }
        }
    }
}
