package com.strawcoding.strawmoneybook.presentation

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.strawcoding.strawmoneybook.protocol.WearTxTypes
import com.strawcoding.strawmoneybook.sync.WearEntryDraft
import org.json.JSONObject

/** Which picker the account/category screen is currently filling. */
enum class PickerTarget { ACCOUNT, PEER_ACCOUNT, SOURCE_ACCOUNT, CATEGORY }

/**
 * In-memory entry being composed on the watch. Shared across the add flow
 * screens so pickers can write back without a ViewModel per screen.
 */
class WearDraftState {
    var type by mutableStateOf(WearTxTypes.EXPENSE)
    var digits by mutableStateOf("")
    var accountId by mutableStateOf("")
    var accountName by mutableStateOf("")
    var peerAccountId by mutableStateOf("")
    var peerAccountName by mutableStateOf("")
    var categoryId by mutableStateOf("")
    var categoryName by mutableStateOf("")
    var note by mutableStateOf("")
    var occurredAtMillis by mutableStateOf(System.currentTimeMillis())
    var loanDirection by mutableStateOf("lend")
    var counterpartyName by mutableStateOf("")
    var editingTxId by mutableStateOf("")
    var pickerTarget by mutableStateOf(PickerTarget.ACCOUNT)
    val tags = mutableStateListOf<String>()

    val amountMinor: Long
        get() {
            val amount = digits.toDoubleOrNull() ?: return 0L
            return Math.round(amount * 100.0)
        }

    val isEditing: Boolean get() = editingTxId.isNotBlank()

    fun reset(nextType: String) {
        type = nextType
        digits = ""
        accountId = ""
        accountName = ""
        peerAccountId = ""
        peerAccountName = ""
        categoryId = ""
        categoryName = ""
        note = ""
        occurredAtMillis = System.currentTimeMillis()
        loanDirection = "lend"
        counterpartyName = ""
        editingTxId = ""
        tags.clear()
    }

    fun loadFromRecent(tx: JSONObject) {
        type = tx.optString("type", WearTxTypes.EXPENSE)
        val minor = Math.abs(tx.optLong("amountMinor", 0L))
        digits = if (minor == 0L) "" else trimTrailingZeros(minor / 100.0)
        accountId = tx.optString("accountId", "")
        accountName = tx.optString("accountName", "")
        categoryId = tx.optString("categoryId", "")
        categoryName = tx.optString("categoryName", "")
        note = tx.optString("note", "")
        occurredAtMillis = parseIsoUtcMillis(tx.optString("occurredAt", ""))
        peerAccountId = ""
        peerAccountName = ""
        loanDirection = "lend"
        counterpartyName = ""
        editingTxId = tx.optString("id", "")
        tags.clear()
        tags.addAll(parseTagsJson(tx.optString("tagsJson", "")))
    }

    fun toEntryDraft(): WearEntryDraft = WearEntryDraft(
        type = type,
        amountMinor = amountMinor,
        accountId = accountId.ifBlank { null },
        categoryId = categoryId.ifBlank { null },
        peerAccountId = peerAccountId.ifBlank { null },
        sourceAccountId = if (type == WearTxTypes.CREDIT_REPAY) peerAccountId.ifBlank { null } else null,
        note = note.ifBlank { null },
        tags = tags.toList(),
        occurredAt = isoUtc(occurredAtMillis),
        loanDirection = if (type == WearTxTypes.LOAN) loanDirection else null,
        counterpartyName = if (type == WearTxTypes.LOAN) counterpartyName.ifBlank { null } else null,
    )

    /** Missing-field reason, or null when the draft can be submitted. */
    fun validationError(): String? {
        if (type == WearTxTypes.ADJUSTMENT) {
            if (amountMinor == 0L) return "請輸入金額"
        } else if (amountMinor <= 0L) {
            return "請輸入金額"
        }
        if (accountId.isBlank()) return "請選擇帳戶"
        if (WearTxTypes.requiresCategory(type) && categoryId.isBlank()) return "請選擇分類"
        if (WearTxTypes.requiresPeerAccount(type)) {
            if (peerAccountId.isBlank()) {
                return if (type == WearTxTypes.CREDIT_REPAY) "請選擇付款帳戶" else "請選擇轉入帳戶"
            }
            if (peerAccountId == accountId) return "帳戶不可相同"
        }
        if (type == WearTxTypes.LOAN && counterpartyName.isBlank()) return "請選擇借貸對象"
        return null
    }
}

fun parseTagsJson(raw: String): List<String> {
    if (raw.isBlank()) return emptyList()
    return runCatching {
        val arr = org.json.JSONArray(raw)
        buildList {
            for (i in 0 until arr.length()) {
                arr.optString(i, "").trim().takeIf { it.isNotEmpty() }?.let { add(it) }
            }
        }
    }.getOrDefault(emptyList())
}

private fun trimTrailingZeros(value: Double): String {
    val text = String.format(java.util.Locale.US, "%.2f", value)
    return text.trimEnd('0').trimEnd('.')
}
