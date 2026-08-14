package com.strawcoding.strawmoneybook.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Cached glance snapshot from phone for Tile / home screen. */
class WearCacheStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun applySnapshot(body: JSONObject) {
        prefs.edit()
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
            .putString(KEY_DEFAULT_ACCOUNT, body.optString("defaultAccountId", ""))
            .putString(KEY_DEFAULT_EXPENSE_CAT, body.optString("defaultExpenseCategoryId", ""))
            .putString(KEY_DEFAULT_INCOME_CAT, body.optString("defaultIncomeCategoryId", ""))
            .putString(KEY_RECENT_JSON, body.optJSONArray("recentTxs")?.toString() ?: "[]")
            .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
            .apply()
    }

    fun todaySpendMinor(): Long = prefs.getLong(KEY_TODAY_SPEND, 0L)
    fun budgetRemainingMinor(): Long? {
        val value = prefs.getLong(KEY_BUDGET_REMAINING, Long.MIN_VALUE)
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

    fun recentTxs(): List<JSONObject> {
        return try {
            val arr = JSONArray(prefs.getString(KEY_RECENT_JSON, "[]") ?: "[]")
            buildList {
                for (i in 0 until arr.length()) {
                    add(arr.getJSONObject(i))
                }
            }
        } catch (_: Exception) {
            emptyList()
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
        private const val KEY_SYNC_EPOCH = "sync_epoch"
        private const val KEY_SNAPSHOT_REV = "snapshot_rev"
        private const val KEY_CATALOG_REV = "catalog_rev"
        private const val KEY_LEDGER_REV = "ledger_rev"
        private const val KEY_ACTIVE_LEDGER = "active_ledger"
        private const val KEY_TODAY_SPEND = "today_spend"
        private const val KEY_BUDGET_REMAINING = "budget_remaining"
        private const val KEY_DEFAULT_ACCOUNT = "default_account"
        private const val KEY_DEFAULT_EXPENSE_CAT = "default_expense_cat"
        private const val KEY_DEFAULT_INCOME_CAT = "default_income_cat"
        private const val KEY_RECENT_JSON = "recent_json"
        private const val KEY_UPDATED_AT = "updated_at"
        private const val KEY_NEARBY = "nearby"
        private const val KEY_NODE_NAME = "node_name"
    }
}
