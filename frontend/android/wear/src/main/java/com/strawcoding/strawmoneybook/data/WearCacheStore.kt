package com.strawcoding.strawmoneybook.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Snapshot picker option (account or category) with usage-derived flags. */
data class WearOption(
    val id: String,
    val name: String,
    val kind: String,
    val recent: Boolean,
    val favorite: Boolean,
    val balanceMinor: Long = 0L,
    val defaultIsReimbursable: Boolean = false,
)

data class WearLedger(val id: String, val name: String)

/** Watch-local quick template. Templates are not a phone table in this scope. */
data class WearTemplate(
    val id: String,
    val label: String,
    val type: String,
    val amountMinor: Long,
    val accountId: String,
    val categoryId: String,
    val isReimbursable: Boolean = false,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("label", label)
        .put("type", type)
        .put("amountMinor", amountMinor)
        .put("accountId", accountId)
        .put("categoryId", categoryId)
        .put("isReimbursable", isReimbursable)

    companion object {
        fun fromJson(body: JSONObject): WearTemplate = WearTemplate(
            id = body.optString("id", ""),
            label = body.optString("label", ""),
            type = body.optString("type", "expense"),
            amountMinor = body.optLong("amountMinor", 0L),
            accountId = body.optString("accountId", ""),
            categoryId = body.optString("categoryId", ""),
            isReimbursable = body.optBoolean("isReimbursable", false),
        )
    }
}

/** Cached glance snapshot from phone for Tile / home screen / pickers. */
class WearCacheStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun applySnapshot(body: JSONObject) {
        val editor = prefs.edit()
            .putString(KEY_SYNC_EPOCH, body.optString("syncEpoch", ""))
            .putLong(KEY_SNAPSHOT_REV, body.optLong("snapshotRevision", 0L))
            .putLong(KEY_CATALOG_REV, body.optLong("catalogRevision", 0L))
            .putLong(KEY_LEDGER_REV, body.optLong("ledgerRevision", 0L))
            .putString(KEY_ACTIVE_LEDGER, body.optString("activeLedgerId", body.optString("ledgerId", "")))
            .putLong(KEY_TODAY_SPEND, body.optLong("todaySpendMinor", 0L))
            .putLong(
                KEY_BUDGET_REMAINING,
                if (body.has("budgetRemainingMinor")) body.optLong("budgetRemainingMinor") else Long.MIN_VALUE,
            )
            .putLong(
                KEY_ASSETS_TOTAL,
                if (body.has("assetsTotalMinor")) body.optLong("assetsTotalMinor") else Long.MIN_VALUE,
            )
            .putString(KEY_DEFAULT_ACCOUNT, body.optString("defaultAccountId", ""))
            .putString(KEY_DEFAULT_EXPENSE_CAT, body.optString("defaultExpenseCategoryId", ""))
            .putString(KEY_DEFAULT_INCOME_CAT, body.optString("defaultIncomeCategoryId", ""))
            .putString(KEY_RECENT_JSON, body.optJSONArray("recentTxs")?.toString() ?: "[]")
            .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
        body.optJSONArray("accounts")?.let { editor.putString(KEY_ACCOUNTS_JSON, it.toString()) }
        body.optJSONArray("categories")?.let { editor.putString(KEY_CATEGORIES_JSON, it.toString()) }
        body.optJSONArray("ledgers")?.let { editor.putString(KEY_LEDGERS_JSON, it.toString()) }
        body.optJSONObject("loans")?.let { editor.putString(KEY_LOANS_JSON, it.toString()) }
        editor.apply()
    }

    fun todaySpendMinor(): Long = prefs.getLong(KEY_TODAY_SPEND, 0L)

    fun budgetRemainingMinor(): Long? = nullableLong(KEY_BUDGET_REMAINING)

    fun assetsTotalMinor(): Long? = nullableLong(KEY_ASSETS_TOTAL)

    private fun nullableLong(key: String): Long? {
        val value = prefs.getLong(key, Long.MIN_VALUE)
        return if (value == Long.MIN_VALUE) null else value
    }

    fun activeLedgerId(): String = prefs.getString(KEY_ACTIVE_LEDGER, "") ?: ""
    fun catalogRevision(): Long = prefs.getLong(KEY_CATALOG_REV, 0L)
    fun snapshotRevision(): Long = prefs.getLong(KEY_SNAPSHOT_REV, 0L)
    fun syncEpoch(): String = prefs.getString(KEY_SYNC_EPOCH, "") ?: ""
    fun updatedAtMs(): Long = prefs.getLong(KEY_UPDATED_AT, 0L)
    fun defaultAccountId(): String = prefs.getString(KEY_DEFAULT_ACCOUNT, "") ?: ""
    fun defaultExpenseCategoryId(): String = prefs.getString(KEY_DEFAULT_EXPENSE_CAT, "") ?: ""
    fun defaultIncomeCategoryId(): String = prefs.getString(KEY_DEFAULT_INCOME_CAT, "") ?: ""

    fun setActiveLedgerId(ledgerId: String) {
        prefs.edit().putString(KEY_ACTIVE_LEDGER, ledgerId).apply()
    }

    fun ledgers(): List<WearLedger> = readArray(KEY_LEDGERS_JSON).map {
        WearLedger(id = it.optString("id", ""), name = it.optString("name", ""))
    }.filter { it.id.isNotBlank() }

    fun accounts(): List<WearOption> = readArray(KEY_ACCOUNTS_JSON).map {
        WearOption(
            id = it.optString("id", ""),
            name = it.optString("name", ""),
            kind = it.optString("kind", "cash"),
            recent = it.optBoolean("recent", false),
            favorite = it.optBoolean("favorite", false),
            balanceMinor = it.optLong("balanceMinor", 0L),
        )
    }.filter { it.id.isNotBlank() }

    fun categories(kind: String): List<WearOption> = readArray(KEY_CATEGORIES_JSON).map {
        WearOption(
            id = it.optString("id", ""),
            name = it.optString("name", ""),
            kind = it.optString("kind", "expense"),
            recent = it.optBoolean("recent", false),
            favorite = it.optBoolean("favorite", false),
            defaultIsReimbursable = it.optBoolean("defaultIsReimbursable", false),
        )
    }.filter { it.id.isNotBlank() && it.kind == kind }

    /** Category default for Quick Add-aligned reimbursable prefill. */
    fun categoryDefaultIsReimbursable(categoryId: String): Boolean {
        if (categoryId.isBlank()) return false
        return readArray(KEY_CATEGORIES_JSON).any {
            it.optString("id", "") == categoryId && it.optBoolean("defaultIsReimbursable", false)
        }
    }

    fun loanSummary(): JSONObject = try {
        JSONObject(prefs.getString(KEY_LOANS_JSON, "{}") ?: "{}")
    } catch (_: Exception) {
        JSONObject()
    }

    fun recentTxs(): List<JSONObject> = readArray(KEY_RECENT_JSON)

    private fun readArray(key: String): List<JSONObject> {
        return try {
            val arr = JSONArray(prefs.getString(key, "[]") ?: "[]")
            buildList {
                for (i in 0 until arr.length()) {
                    arr.optJSONObject(i)?.let { add(it) }
                }
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun templates(): List<WearTemplate> = readArray(KEY_TEMPLATES_JSON)
        .map { WearTemplate.fromJson(it) }
        .filter { it.id.isNotBlank() && it.amountMinor > 0L }

    fun saveTemplates(templates: List<WearTemplate>) {
        val arr = JSONArray()
        templates.take(MAX_TEMPLATES).forEach { arr.put(it.toJson()) }
        prefs.edit().putString(KEY_TEMPLATES_JSON, arr.toString()).apply()
    }

    /** Remembered last submitted entry, used by repeat-last. */
    fun saveLastEntry(body: JSONObject) {
        prefs.edit().putString(KEY_LAST_ENTRY_JSON, body.toString()).apply()
    }

    fun lastEntry(): JSONObject? {
        val raw = prefs.getString(KEY_LAST_ENTRY_JSON, "") ?: ""
        if (raw.isBlank()) return null
        return try {
            JSONObject(raw)
        } catch (_: Exception) {
            null
        }
    }

    fun setConnectionHint(nearby: Boolean, nodeDisplayName: String?) {
        prefs.edit()
            .putBoolean(KEY_NEARBY, nearby)
            .putString(KEY_NODE_NAME, nodeDisplayName ?: "")
            .apply()
    }

    fun isNearby(): Boolean = prefs.getBoolean(KEY_NEARBY, false)
    fun nodeDisplayName(): String = prefs.getString(KEY_NODE_NAME, "") ?: ""

    companion object {
        private const val PREFS = "smb.wear.cache"
        private const val MAX_TEMPLATES = 8
        private const val KEY_SYNC_EPOCH = "sync_epoch"
        private const val KEY_SNAPSHOT_REV = "snapshot_rev"
        private const val KEY_CATALOG_REV = "catalog_rev"
        private const val KEY_LEDGER_REV = "ledger_rev"
        private const val KEY_ACTIVE_LEDGER = "active_ledger"
        private const val KEY_TODAY_SPEND = "today_spend"
        private const val KEY_BUDGET_REMAINING = "budget_remaining"
        private const val KEY_ASSETS_TOTAL = "assets_total"
        private const val KEY_DEFAULT_ACCOUNT = "default_account"
        private const val KEY_DEFAULT_EXPENSE_CAT = "default_expense_cat"
        private const val KEY_DEFAULT_INCOME_CAT = "default_income_cat"
        private const val KEY_RECENT_JSON = "recent_json"
        private const val KEY_ACCOUNTS_JSON = "accounts_json"
        private const val KEY_CATEGORIES_JSON = "categories_json"
        private const val KEY_LEDGERS_JSON = "ledgers_json"
        private const val KEY_LOANS_JSON = "loans_json"
        private const val KEY_TEMPLATES_JSON = "templates_json"
        private const val KEY_LAST_ENTRY_JSON = "last_entry_json"
        private const val KEY_UPDATED_AT = "updated_at"
        private const val KEY_NEARBY = "nearby"
        private const val KEY_NODE_NAME = "node_name"
    }
}
