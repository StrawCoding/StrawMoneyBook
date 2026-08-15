package com.strawcoding.strawmoneybook.sync

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.Node
import com.google.android.gms.wearable.Wearable
import com.strawcoding.strawmoneybook.data.OutboxEntity
import com.strawcoding.strawmoneybook.data.OutboxOps
import com.strawcoding.strawmoneybook.data.OutboxStatus
import com.strawcoding.strawmoneybook.data.WearCacheStore
import com.strawcoding.strawmoneybook.data.WearOutboxDatabase
import com.strawcoding.strawmoneybook.protocol.WearNearbyPolicy
import com.strawcoding.strawmoneybook.protocol.WearPaths
import com.strawcoding.strawmoneybook.protocol.WearTxOps
import com.strawcoding.strawmoneybook.protocol.WearTxTypes
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/** Everything a watch entry can carry; unused fields stay null per type. */
data class WearEntryDraft(
    val type: String,
    val amountMinor: Long,
    val accountId: String? = null,
    val categoryId: String? = null,
    val peerAccountId: String? = null,
    val sourceAccountId: String? = null,
    val note: String? = null,
    val tags: List<String> = emptyList(),
    val occurredAt: String? = null,
    val loanDirection: String? = null,
    val counterpartyName: String? = null,
    val isReimbursable: Boolean = false,
)

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

    /** Kept for the stage A quick-add call sites. */
    suspend fun enqueueExpenseOrIncome(
        type: String,
        amountMinor: Long,
        note: String?,
        accountId: String? = null,
        categoryId: String? = null,
    ): OutboxEntity = enqueueEntry(
        WearEntryDraft(
            type = type,
            amountMinor = amountMinor,
            accountId = accountId,
            categoryId = categoryId,
            note = note,
        )
    )

    suspend fun enqueueEntry(draft: WearEntryDraft): OutboxEntity = withContext(Dispatchers.IO) {
        if (!WearTxTypes.isKnown(draft.type)) throw IllegalArgumentException("unknown_type")
        val ledgerId = cache.activeLedgerId().ifBlank { throw IllegalStateException("no_ledger") }
        val resolvedAccount = draft.accountId?.takeIf { it.isNotBlank() }
            ?: cache.defaultAccountId().ifBlank { throw IllegalStateException("catalog_required") }
        val resolvedCategory = resolveCategoryId(draft)
        if (WearTxTypes.requiresCategory(draft.type) && resolvedCategory.isBlank()) {
            throw IllegalStateException("catalog_required")
        }
        val peer = if (draft.type == WearTxTypes.CREDIT_REPAY) {
            draft.sourceAccountId ?: draft.peerAccountId
        } else {
            draft.peerAccountId
        }
        if (WearTxTypes.requiresPeerAccount(draft.type) && peer.isNullOrBlank()) {
            throw IllegalStateException("peer_required")
        }
        if (draft.type == WearTxTypes.LOAN) {
            if (draft.loanDirection != "lend" && draft.loanDirection != "borrow") {
                throw IllegalStateException("loan_direction_required")
            }
            if (draft.counterpartyName.isNullOrBlank()) throw IllegalStateException("counterparty_required")
        }

        val now = nowIso()
        val row = OutboxEntity(
            clientTxId = "room_${UUID.randomUUID()}",
            idempotencyKey = UUID.randomUUID().toString(),
            ledgerId = ledgerId,
            type = draft.type,
            accountId = resolvedAccount,
            categoryId = resolvedCategory,
            amountMinor = draft.amountMinor,
            catalogRevision = cache.catalogRevision(),
            occurredAt = draft.occurredAt?.takeIf { it.isNotBlank() } ?: now,
            note = draft.note?.take(200),
            status = OutboxStatus.PENDING,
            lastError = null,
            phoneTxId = null,
            createdAt = now,
            updatedAt = now,
            op = OutboxOps.CREATE,
            peerAccountId = peer?.takeIf { it.isNotBlank() },
            sourceAccountId = draft.sourceAccountId?.takeIf { it.isNotBlank() },
            tagsJson = tagsJsonOrNull(draft.tags),
            extrasJson = extrasJsonOrNull(draft),
            targetTxId = null,
        )
        dao.insert(row)
        cache.saveLastEntry(lastEntryJson(row))
        flushPending()
        dao.findByIdempotencyKey(row.idempotencyKey) ?: row
    }

    /** Edit an existing phone transaction. Only simple cash rows are editable. */
    suspend fun enqueueUpdate(
        targetTxId: String,
        type: String,
        amountMinor: Long,
        accountId: String,
        categoryId: String?,
        note: String?,
        tags: List<String> = emptyList(),
        occurredAt: String? = null,
        isReimbursable: Boolean = false,
    ): OutboxEntity = withContext(Dispatchers.IO) {
        if (targetTxId.isBlank()) throw IllegalArgumentException("target_required")
        if (!WearTxTypes.EDITABLE.contains(type)) throw IllegalArgumentException("type_not_editable")
        val ledgerId = cache.activeLedgerId().ifBlank { throw IllegalStateException("no_ledger") }
        val now = nowIso()
        val reimbursable = type == WearTxTypes.EXPENSE && isReimbursable
        val row = OutboxEntity(
            clientTxId = "room_${UUID.randomUUID()}",
            idempotencyKey = UUID.randomUUID().toString(),
            ledgerId = ledgerId,
            type = type,
            accountId = accountId,
            categoryId = categoryId ?: "",
            amountMinor = amountMinor,
            catalogRevision = cache.catalogRevision(),
            occurredAt = occurredAt?.takeIf { it.isNotBlank() } ?: now,
            note = note?.take(200),
            status = OutboxStatus.PENDING,
            lastError = null,
            phoneTxId = targetTxId,
            createdAt = now,
            updatedAt = now,
            op = OutboxOps.UPDATE,
            tagsJson = tagsJsonOrNull(tags),
            extrasJson = reimbursableExtrasJson(reimbursable),
            targetTxId = targetTxId,
        )
        dao.insert(row)
        flushPending()
        dao.findByIdempotencyKey(row.idempotencyKey) ?: row
    }

    suspend fun enqueueDelete(targetTxId: String): OutboxEntity = withContext(Dispatchers.IO) {
        if (targetTxId.isBlank()) throw IllegalArgumentException("target_required")
        val ledgerId = cache.activeLedgerId().ifBlank { throw IllegalStateException("no_ledger") }
        val now = nowIso()
        val row = OutboxEntity(
            clientTxId = "room_${UUID.randomUUID()}",
            idempotencyKey = UUID.randomUUID().toString(),
            ledgerId = ledgerId,
            type = WearTxTypes.EXPENSE,
            accountId = "",
            categoryId = "",
            amountMinor = 0L,
            catalogRevision = cache.catalogRevision(),
            occurredAt = now,
            note = null,
            status = OutboxStatus.PENDING,
            lastError = null,
            phoneTxId = targetTxId,
            createdAt = now,
            updatedAt = now,
            op = OutboxOps.DELETE,
            targetTxId = targetTxId,
        )
        dao.insert(row)
        flushPending()
        dao.findByIdempotencyKey(row.idempotencyKey) ?: row
    }

    /** Repeat the last submitted entry as a brand new one. */
    suspend fun repeatLast(): OutboxEntity? = withContext(Dispatchers.IO) {
        val last = cache.lastEntry() ?: dao.findLastCreate()?.let { lastEntryJson(it) } ?: return@withContext null
        val draft = WearEntryDraft(
            type = last.optString("type", WearTxTypes.EXPENSE),
            amountMinor = last.optLong("amountMinor", 0L),
            accountId = last.optString("accountId", "").ifBlank { null },
            categoryId = last.optString("categoryId", "").ifBlank { null },
            peerAccountId = last.optString("peerAccountId", "").ifBlank { null },
            sourceAccountId = last.optString("sourceAccountId", "").ifBlank { null },
            note = last.optString("note", "").ifBlank { null },
            tags = parseTags(last.optString("tagsJson", "")),
            loanDirection = last.optString("loanDirection", "").ifBlank { null },
            counterpartyName = last.optString("counterpartyName", "").ifBlank { null },
            isReimbursable = last.optBoolean("isReimbursable", false),
        )
        if (draft.amountMinor <= 0L) return@withContext null
        enqueueEntry(draft)
    }

    /**
     * Switch the watch-side ledger. Applied locally right away so offline entry
     * keeps working, and mirrored to the phone so its writes stay authorized.
     */
    suspend fun setActiveLedger(ledgerId: String) = withContext(Dispatchers.IO) {
        if (ledgerId.isBlank()) return@withContext
        cache.setActiveLedgerId(ledgerId)
        val node = findNearbyPhoneNode() ?: run {
            cache.setConnectionHint(false, null)
            return@withContext
        }
        cache.setConnectionHint(true, node.displayName)
        runCatching {
            sendJson(
                node.id,
                WearPaths.LEDGER_SET,
                JSONObject()
                    .put("protocolVersion", WearPaths.PROTOCOL_VERSION)
                    .put("msg", "ledger.set")
                    .put("ledgerId", ledgerId),
            )
        }
        Unit
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
            try {
                sendJson(node.id, WearTxOps.pathFor(row.op), buildPayload(row))
                dao.updateStatus(row.idempotencyKey, OutboxStatus.SENT, null, row.phoneTxId, nowIso())
            } catch (error: Exception) {
                Log.w(TAG, "send failed", error)
                dao.updateStatus(row.idempotencyKey, OutboxStatus.FAILED, error.message, row.phoneTxId, nowIso())
            }
        }
    }

    private fun buildPayload(row: OutboxEntity): JSONObject {
        val payload = JSONObject()
            .put("protocolVersion", WearPaths.PROTOCOL_VERSION)
            .put("idempotencyKey", row.idempotencyKey)
            .put("clientTxId", row.clientTxId)
            .put("ledgerId", row.ledgerId)
            .put("catalogRevision", row.catalogRevision)
        if (row.op == OutboxOps.DELETE) {
            return payload
                .put("msg", "tx.delete")
                .put("op", OutboxOps.DELETE)
                .put("targetTxId", row.targetTxId ?: "")
        }
        payload
            .put("msg", if (row.op == OutboxOps.UPDATE) "tx.update" else "tx.create")
            .put("op", row.op)
            .put("type", row.type)
            .put("accountId", row.accountId)
            .put("amountMinor", row.amountMinor)
            .put("occurredAt", row.occurredAt)
            .put("note", row.note ?: "")
        if (row.categoryId.isNotBlank()) payload.put("categoryId", row.categoryId)
        if (row.op == OutboxOps.UPDATE) {
            payload.put("targetTxId", row.targetTxId ?: "")
            row.extrasJson?.takeIf { it.isNotBlank() }?.let { raw ->
                runCatching { JSONObject(raw) }.getOrNull()?.let { extras ->
                    val keys = extras.keys()
                    while (keys.hasNext()) {
                        val key = keys.next()
                        payload.put(key, extras.get(key))
                    }
                }
            }
        } else {
            row.peerAccountId?.takeIf { it.isNotBlank() }?.let {
                payload.put("peerAccountId", it)
                payload.put("toAccountId", it)
            }
            row.sourceAccountId?.takeIf { it.isNotBlank() }?.let { payload.put("sourceAccountId", it) }
            row.extrasJson?.takeIf { it.isNotBlank() }?.let { raw ->
                runCatching { JSONObject(raw) }.getOrNull()?.let { extras ->
                    val keys = extras.keys()
                    while (keys.hasNext()) {
                        val key = keys.next()
                        payload.put(key, extras.get(key))
                    }
                }
            }
        }
        row.tagsJson?.takeIf { it.isNotBlank() }?.let { raw ->
            runCatching { JSONArray(raw) }.getOrNull()?.let { payload.put("tags", it) }
        }
        return payload
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

    private fun resolveCategoryId(draft: WearEntryDraft): String {
        draft.categoryId?.takeIf { it.isNotBlank() }?.let { return it }
        if (!WearTxTypes.requiresCategory(draft.type)) return ""
        return if (draft.type == WearTxTypes.INCOME) {
            cache.defaultIncomeCategoryId()
        } else {
            cache.defaultExpenseCategoryId()
        }
    }

    private fun tagsJsonOrNull(tags: List<String>): String? {
        val cleaned = tags.map { it.trim() }.filter { it.isNotEmpty() }.distinct().take(12)
        if (cleaned.isEmpty()) return null
        return JSONArray(cleaned).toString()
    }

    private fun parseTags(raw: String): List<String> {
        if (raw.isBlank()) return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            buildList {
                for (i in 0 until arr.length()) {
                    arr.optString(i, "").trim().takeIf { it.isNotEmpty() }?.let { add(it) }
                }
            }
        }.getOrDefault(emptyList())
    }

    private fun extrasJsonOrNull(draft: WearEntryDraft): String? {
        val extras = JSONObject()
        draft.loanDirection?.takeIf { it.isNotBlank() }?.let { extras.put("loanDirection", it) }
        draft.counterpartyName?.takeIf { it.isNotBlank() }?.let { extras.put("counterpartyName", it) }
        val reimbursable = draft.type == WearTxTypes.EXPENSE && draft.isReimbursable
        if (reimbursable) {
            extras.put("isReimbursable", true)
            extras.put("includeInBudget", false)
            extras.put("includeInAnalysis", false)
        } else if (draft.type == WearTxTypes.EXPENSE) {
            // Explicit false so phone never inherits a stale true from a prior edit path.
            extras.put("isReimbursable", false)
        }
        return if (extras.length() == 0) null else extras.toString()
    }

    private fun reimbursableExtrasJson(reimbursable: Boolean): String {
        val extras = JSONObject().put("isReimbursable", reimbursable)
        if (reimbursable) {
            extras.put("includeInBudget", false)
            extras.put("includeInAnalysis", false)
        }
        return extras.toString()
    }

    private fun lastEntryJson(row: OutboxEntity): JSONObject {
        val body = JSONObject()
            .put("type", row.type)
            .put("amountMinor", row.amountMinor)
            .put("accountId", row.accountId)
            .put("categoryId", row.categoryId)
            .put("note", row.note ?: "")
            .put("peerAccountId", row.peerAccountId ?: "")
            .put("sourceAccountId", row.sourceAccountId ?: "")
            .put("tagsJson", row.tagsJson ?: "")
        row.extrasJson?.takeIf { it.isNotBlank() }?.let { raw ->
            runCatching { JSONObject(raw) }.getOrNull()?.let { extras ->
                val keys = extras.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    body.put(key, extras.get(key))
                }
            }
        }
        return body
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
