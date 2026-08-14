package com.strawcoding.strawmoneybook.sync

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.Node
import com.google.android.gms.wearable.Wearable
import com.strawcoding.strawmoneybook.data.OutboxEntity
import com.strawcoding.strawmoneybook.data.OutboxStatus
import com.strawcoding.strawmoneybook.data.WearCacheStore
import com.strawcoding.strawmoneybook.data.WearOutboxDatabase
import com.strawcoding.strawmoneybook.protocol.WearNearbyPolicy
import com.strawcoding.strawmoneybook.protocol.WearPaths
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONObject

class WearSyncRepository(context: Context) {
    private val appContext = context.applicationContext
    private val dao = WearOutboxDatabase.get(appContext).outboxDao()
    private val cache = WearCacheStore(appContext)
    private val messageClient: MessageClient = Wearable.getMessageClient(appContext)
    private val nodeClient = Wearable.getNodeClient(appContext)
    private val capabilityClient = Wearable.getCapabilityClient(appContext)

    fun observeRecent() = dao.observeRecent(8)
    fun observePendingCount() = dao.observePendingCount()
    fun cacheStore(): WearCacheStore = cache

    suspend fun enqueueExpenseOrIncome(
        type: String,
        amountMinor: Long,
        note: String?,
        accountId: String? = null,
        categoryId: String? = null,
    ): OutboxEntity = withContext(Dispatchers.IO) {
        val ledgerId = cache.activeLedgerId().ifBlank { throw IllegalStateException("no_ledger") }
        val resolvedAccount = accountId?.takeIf { it.isNotBlank() }
            ?: cache.defaultAccountId().ifBlank { throw IllegalStateException("catalog_required") }
        val resolvedCategory = categoryId?.takeIf { it.isNotBlank() }
            ?: if (type == "income") {
                cache.defaultIncomeCategoryId().ifBlank { throw IllegalStateException("catalog_required") }
            } else {
                cache.defaultExpenseCategoryId().ifBlank { throw IllegalStateException("catalog_required") }
            }
        val now = nowIso()
        val row = OutboxEntity(
            clientTxId = "room_${UUID.randomUUID()}",
            idempotencyKey = UUID.randomUUID().toString(),
            ledgerId = ledgerId,
            type = type,
            accountId = resolvedAccount,
            categoryId = resolvedCategory,
            amountMinor = amountMinor,
            catalogRevision = cache.catalogRevision(),
            occurredAt = now,
            note = note?.take(200),
            status = OutboxStatus.PENDING,
            lastError = null,
            phoneTxId = null,
            createdAt = now,
            updatedAt = now,
        )
        dao.insert(row)
        flushPending()
        dao.findByIdempotencyKey(row.idempotencyKey) ?: row
    }

    suspend fun requestHelloAndSnapshot() = withContext(Dispatchers.IO) {
        val node = findNearbyPhoneNode() ?: run {
            cache.setConnectionHint(false, null)
            return@withContext
        }
        cache.setConnectionHint(true, node.displayName)
        sendJson(node.id, WearPaths.HELLO, JSONObject().put("protocolVersion", WearPaths.PROTOCOL_VERSION).put("msg", "hello"))
        sendJson(
            node.id,
            WearPaths.SNAPSHOT_REQUEST,
            JSONObject()
                .put("protocolVersion", WearPaths.PROTOCOL_VERSION)
                .put("msg", "snapshot.request")
                .put("syncEpoch", cache.syncEpoch())
                .put("snapshotRevision", cache.snapshotRevision()),
        )
    }

    suspend fun flushPending() = withContext(Dispatchers.IO) {
        val node = findNearbyPhoneNode() ?: run {
            cache.setConnectionHint(false, null)
            return@withContext
        }
        cache.setConnectionHint(true, node.displayName)
        for (row in dao.listFlushable()) {
            val payload = JSONObject()
                .put("protocolVersion", WearPaths.PROTOCOL_VERSION)
                .put("msg", "tx.create")
                .put("idempotencyKey", row.idempotencyKey)
                .put("clientTxId", row.clientTxId)
                .put("ledgerId", row.ledgerId)
                .put("type", row.type)
                .put("accountId", row.accountId)
                .put("categoryId", row.categoryId)
                .put("amountMinor", row.amountMinor)
                .put("catalogRevision", row.catalogRevision)
                .put("occurredAt", row.occurredAt)
                .put("note", row.note ?: "")
            try {
                sendJson(node.id, WearPaths.TX_CREATE, payload)
                dao.updateStatus(row.idempotencyKey, OutboxStatus.SENT, null, null, nowIso())
            } catch (error: Exception) {
                Log.w(TAG, "send failed", error)
                dao.updateStatus(row.idempotencyKey, OutboxStatus.FAILED, error.message, null, nowIso())
            }
        }
    }

    suspend fun handleAck(raw: String) = withContext(Dispatchers.IO) {
        val body = JSONObject(raw)
        val key = body.optString("idempotencyKey", "").trim()
        if (key.isEmpty()) return@withContext
        val status = body.optString("status", "")
        val txId = body.optString("txId", null)
        val error = body.optString("error", null)
        when (status) {
            "ok", "duplicate" -> dao.updateStatus(key, OutboxStatus.ACK_OK, null, txId, nowIso())
            else -> dao.updateStatus(key, OutboxStatus.ACK_NACK, error ?: status, txId, nowIso())
        }
    }

    suspend fun handleSnapshotOrHello(raw: String) = withContext(Dispatchers.IO) {
        val body = JSONObject(raw)
        cache.applySnapshot(body)
    }

    private suspend fun findNearbyPhoneNode(): Node? {
        return try {
            val info = capabilityClient.getCapability(
                WearPaths.CAPABILITY_PHONE,
                CapabilityClient.FILTER_REACHABLE,
            ).await()
            val connected = nodeClient.connectedNodes.await()
            val byId = connected.associateBy { it.id }
            info.nodes
                .mapNotNull { byId[it.id] ?: it }
                .firstOrNull { WearNearbyPolicy.maySend(it.isNearby) }
                ?: connected.firstOrNull { WearNearbyPolicy.maySend(it.isNearby) }
        } catch (error: Exception) {
            Log.w(TAG, "capability lookup failed", error)
            nodeClient.connectedNodes.await().firstOrNull { WearNearbyPolicy.maySend(it.isNearby) }
        }
    }

    private suspend fun sendJson(nodeId: String, path: String, body: JSONObject) {
        if (!WearPaths.isAllowed(path)) {
            throw IllegalArgumentException("path_not_allowed")
        }
        val nodes = nodeClient.connectedNodes.await()
        val target = nodes.firstOrNull { it.id == nodeId }
        if (target == null || !WearNearbyPolicy.maySend(target.isNearby)) {
            throw IllegalStateException("not_nearby")
        }
        messageClient.sendMessage(nodeId, path, body.toString().toByteArray(Charsets.UTF_8)).await()
    }

    companion object {
        private const val TAG = "WearSync"
        fun nowIso(): String {
            val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
            format.timeZone = TimeZone.getTimeZone("UTC")
            return format.format(Date())
        }
    }
}
