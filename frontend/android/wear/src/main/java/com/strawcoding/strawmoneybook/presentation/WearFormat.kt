package com.strawcoding.strawmoneybook.presentation

import com.strawcoding.strawmoneybook.protocol.WearTxTypes
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

private val ISO_UTC = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"

fun formatTwd(minor: Long): String {
    val yuan = minor / 100.0
    return NumberFormat.getCurrencyInstance(Locale.TAIWAN).format(yuan)
}

fun formatSignedTwd(minor: Long): String {
    val prefix = if (minor > 0) "+" else ""
    return prefix + formatTwd(minor)
}

fun typeLabel(type: String): String = when (type) {
    WearTxTypes.EXPENSE -> "支出"
    WearTxTypes.INCOME -> "收入"
    WearTxTypes.TRANSFER -> "轉帳"
    WearTxTypes.ADJUSTMENT -> "調整"
    WearTxTypes.CREDIT_SPEND -> "刷卡"
    WearTxTypes.CREDIT_REPAY -> "卡費還款"
    WearTxTypes.CREDIT_REFUND -> "卡片退款"
    WearTxTypes.LOAN -> "借貸"
    else -> type
}

fun opLabel(op: String): String = when (op) {
    "update" -> "修改"
    "delete" -> "刪除"
    else -> "新增"
}

fun statusLabel(status: String): String = when (status) {
    "pending" -> "待送"
    "sent" -> "已送出"
    "ack_ok" -> "已入帳"
    "ack_nack" -> "被退回"
    "failed" -> "傳送失敗"
    else -> status
}

fun nowIsoUtc(): String = isoUtc(System.currentTimeMillis())

fun isoUtc(epochMillis: Long): String {
    val format = SimpleDateFormat(ISO_UTC, Locale.US)
    format.timeZone = TimeZone.getTimeZone("UTC")
    return format.format(Date(epochMillis))
}

fun parseIsoUtcMillis(value: String?): Long {
    if (value.isNullOrBlank()) return System.currentTimeMillis()
    val format = SimpleDateFormat(ISO_UTC, Locale.US)
    format.timeZone = TimeZone.getTimeZone("UTC")
    return runCatching { format.parse(value)?.time }.getOrNull() ?: System.currentTimeMillis()
}

/** Local-time label for an ISO UTC instant, e.g. 08/15 14:03. */
fun formatLocalShort(value: String?): String {
    val millis = parseIsoUtcMillis(value)
    val format = SimpleDateFormat("MM/dd HH:mm", Locale.TAIWAN)
    format.timeZone = TimeZone.getDefault()
    return format.format(Date(millis))
}
