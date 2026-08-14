package com.strawcoding.strawmoneybook.presentation

import android.app.Activity
import android.content.Intent
import android.speech.RecognizerIntent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.ScalingLazyListScope
import androidx.wear.compose.foundation.lazy.ScalingLazyListState
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.Checkbox
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.ToggleChip
import com.strawcoding.strawmoneybook.data.OutboxEntity
import com.strawcoding.strawmoneybook.data.WearTemplate
import com.strawcoding.strawmoneybook.protocol.WearTxTypes
import com.strawcoding.strawmoneybook.sync.WearSyncRepository
import kotlinx.coroutines.launch
import org.json.JSONObject

private const val DAY_MILLIS = 24L * 60L * 60L * 1000L
private const val HOUR_MILLIS = 60L * 60L * 1000L

/**
 * Rotary (crown) scrolling for a ScalingLazyColumn. Uses the plain Compose UI
 * rotary event so it works on Wear OS 5 without extra Wear Compose APIs.
 */
@OptIn(ExperimentalComposeUiApi::class)
@Composable
private fun rotaryModifier(state: ScalingLazyListState): Modifier {
    val focusRequester = remember { FocusRequester() }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) {
        runCatching { focusRequester.requestFocus() }
    }
    return Modifier
        .onRotaryScrollEvent { event ->
            scope.launch { state.scrollBy(event.verticalScrollPixels) }
            true
        }
        .focusRequester(focusRequester)
        .focusable()
}

@Composable
private fun WearList(
    state: ScalingLazyListState = rememberScalingLazyListState(),
    content: ScalingLazyListScope.() -> Unit,
) {
    ScalingLazyColumn(
        state = state,
        modifier = Modifier.fillMaxSize().then(rotaryModifier(state)),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
        content = content,
    )
}

@Composable
fun HomeScreen(
    repo: WearSyncRepository,
    refreshTick: Int,
    toast: String,
    onQuickAdd: () -> Unit,
    onPickType: () -> Unit,
    onRecent: () -> Unit,
    onLedgers: () -> Unit,
    onTemplates: () -> Unit,
    onRepeatLast: () -> Unit,
    onRefresh: () -> Unit,
) {
    val pending by repo.observePendingCount().collectAsState(initial = 0)
    val cache = repo.cacheStore()
    val snapshot = remember(refreshTick) {
        HomeSnapshot(
            spend = cache.todaySpendMinor(),
            assets = cache.assetsTotalMinor(),
            budgetRemaining = cache.budgetRemainingMinor(),
            nearby = cache.isNearby(),
            node = cache.nodeDisplayName(),
            ledgerName = cache.ledgers().firstOrNull { it.id == cache.activeLedgerId() }?.name ?: "",
        )
    }
    WearList {
        item {
            Text("今日已花", style = MaterialTheme.typography.caption1, textAlign = TextAlign.Center)
        }
        item {
            Text(
                text = formatTwd(snapshot.spend),
                style = MaterialTheme.typography.display3,
                textAlign = TextAlign.Center,
            )
        }
        if (snapshot.assets != null) {
            item {
                Text(
                    text = "資產 " + formatTwd(snapshot.assets),
                    style = MaterialTheme.typography.caption1,
                    textAlign = TextAlign.Center,
                )
            }
        }
        if (snapshot.budgetRemaining != null) {
            item {
                Text(
                    text = "預算剩餘 " + formatTwd(snapshot.budgetRemaining),
                    style = MaterialTheme.typography.caption1,
                    textAlign = TextAlign.Center,
                )
            }
        }
        item {
            Text(
                text = if (snapshot.nearby) {
                    "已連線 " + snapshot.node.ifBlank { "手機" }
                } else {
                    "未連線（需靠近手機）"
                },
                style = MaterialTheme.typography.caption2,
                textAlign = TextAlign.Center,
            )
        }
        if (pending > 0) {
            item {
                Text(
                    text = "待同步 $pending 筆",
                    style = MaterialTheme.typography.caption1,
                    textAlign = TextAlign.Center,
                )
            }
        }
        if (toast.isNotBlank()) {
            item {
                Text(text = toast, style = MaterialTheme.typography.caption2, textAlign = TextAlign.Center)
            }
        }
        item {
            Button(onClick = onQuickAdd, modifier = Modifier.fillMaxWidth()) {
                Text("記一筆")
            }
        }
        item {
            Chip(onClick = onPickType, label = { Text("選類型記帳") }, modifier = Modifier.fillMaxWidth())
        }
        item {
            Chip(onClick = onRepeatLast, label = { Text("重複上一筆") }, modifier = Modifier.fillMaxWidth())
        }
        item {
            Chip(onClick = onTemplates, label = { Text("範本") }, modifier = Modifier.fillMaxWidth())
        }
        item {
            Chip(
                onClick = onLedgers,
                label = { Text("帳本：" + snapshot.ledgerName.ifBlank { "預設" }) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        item {
            Chip(onClick = onRecent, label = { Text("最近／待送") }, modifier = Modifier.fillMaxWidth())
        }
        item {
            Chip(onClick = onRefresh, label = { Text("重新同步") }, modifier = Modifier.fillMaxWidth())
        }
    }
}

private data class HomeSnapshot(
    val spend: Long,
    val assets: Long?,
    val budgetRemaining: Long?,
    val nearby: Boolean,
    val node: String,
    val ledgerName: String,
)

@Composable
fun TypePickerScreen(current: String, onPick: (String) -> Unit) {
    WearList {
        item { Text("選擇類型", style = MaterialTheme.typography.title3) }
        items(WearTxTypes.ALL) { type ->
            Chip(
                onClick = { onPick(type) },
                label = { Text(typeLabel(type) + if (type == current) " ✓" else "") },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
fun EntryScreen(
    repo: WearSyncRepository,
    draft: WearDraftState,
    toast: String,
    onOpenPicker: (PickerTarget) -> Unit,
    onOpenTags: () -> Unit,
    onOpenTime: () -> Unit,
    onOpenNote: () -> Unit,
    onSubmit: () -> Unit,
) {
    val counterparties = remember(draft.type) { recentCounterparties(repo) }
    WearList {
        item {
            Text(
                text = (if (draft.isEditing) "修改 " else "") + typeLabel(draft.type),
                style = MaterialTheme.typography.title3,
            )
        }
        item {
            Text(
                text = if (draft.digits.isEmpty()) "0" else draft.digits,
                style = MaterialTheme.typography.display3,
            )
        }
        item {
            Numpad(
                onDigit = { d -> if (draft.digits.length < 9) draft.digits += d },
                onDot = {
                    if (!draft.digits.contains('.')) {
                        draft.digits = if (draft.digits.isEmpty()) "0." else draft.digits + "."
                    }
                },
                onBack = { draft.digits = draft.digits.dropLast(1) },
            )
        }
        if (draft.type == WearTxTypes.ADJUSTMENT) {
            item {
                Chip(
                    onClick = {
                        draft.digits = if (draft.digits.startsWith("-")) {
                            draft.digits.removePrefix("-")
                        } else {
                            "-" + draft.digits
                        }
                    },
                    label = { Text("正負號") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        item {
            Chip(
                onClick = { onOpenPicker(PickerTarget.ACCOUNT) },
                label = { Text(accountChipLabel(draft.type) + "：" + draft.accountName.ifBlank { "未選" }) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (WearTxTypes.requiresPeerAccount(draft.type)) {
            item {
                Chip(
                    onClick = {
                        onOpenPicker(
                            if (draft.type == WearTxTypes.CREDIT_REPAY) {
                                PickerTarget.SOURCE_ACCOUNT
                            } else {
                                PickerTarget.PEER_ACCOUNT
                            }
                        )
                    },
                    label = {
                        val label = if (draft.type == WearTxTypes.CREDIT_REPAY) "付款帳戶" else "轉入帳戶"
                        Text(label + "：" + draft.peerAccountName.ifBlank { "未選" })
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        if (WearTxTypes.requiresCategory(draft.type)) {
            item {
                Chip(
                    onClick = { onOpenPicker(PickerTarget.CATEGORY) },
                    label = { Text("分類：" + draft.categoryName.ifBlank { "未選" }) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        if (draft.type == WearTxTypes.LOAN) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    CompactChip(
                        onClick = { draft.loanDirection = "lend" },
                        label = { Text(if (draft.loanDirection == "lend") "借出 ✓" else "借出") },
                    )
                    CompactChip(
                        onClick = { draft.loanDirection = "borrow" },
                        label = { Text(if (draft.loanDirection == "borrow") "借入 ✓" else "借入") },
                    )
                }
            }
            item {
                Text(
                    text = "對象：" + draft.counterpartyName.ifBlank { "未選" },
                    style = MaterialTheme.typography.caption1,
                )
            }
            items(counterparties) { name ->
                CompactChip(
                    onClick = { draft.counterpartyName = name },
                    label = { Text(name) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        item {
            Chip(
                onClick = onOpenTime,
                label = { Text("時間：" + formatLocalShort(isoUtc(draft.occurredAtMillis))) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        item {
            Chip(
                onClick = onOpenNote,
                label = { Text("備註：" + draft.note.ifBlank { "無" }) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        item {
            Chip(
                onClick = onOpenTags,
                label = {
                    Text("標籤：" + if (draft.tags.isEmpty()) "無" else draft.tags.joinToString("、"))
                },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (toast.isNotBlank()) {
            item { Text(toast, style = MaterialTheme.typography.caption2) }
        }
        item {
            Button(onClick = onSubmit, modifier = Modifier.fillMaxWidth()) {
                Text(if (draft.isEditing) "儲存修改" else "送出")
            }
        }
    }
}

private fun accountChipLabel(type: String): String = when (type) {
    WearTxTypes.CREDIT_SPEND, WearTxTypes.CREDIT_REPAY, WearTxTypes.CREDIT_REFUND -> "信用卡"
    WearTxTypes.TRANSFER -> "轉出帳戶"
    else -> "帳戶"
}

@Composable
fun PickerScreen(repo: WearSyncRepository, draft: WearDraftState, onDone: () -> Unit) {
    val cache = repo.cacheStore()
    val isCategory = draft.pickerTarget == PickerTarget.CATEGORY
    val options = remember(draft.pickerTarget, draft.type) {
        if (isCategory) {
            val kind = if (draft.type == WearTxTypes.INCOME) "income" else "expense"
            cache.categories(kind)
        } else {
            val all = cache.accounts()
            when (draft.pickerTarget) {
                PickerTarget.ACCOUNT -> when (draft.type) {
                    WearTxTypes.CREDIT_SPEND,
                    WearTxTypes.CREDIT_REPAY,
                    WearTxTypes.CREDIT_REFUND -> all.filter { it.kind == "credit" }
                    WearTxTypes.TRANSFER, WearTxTypes.LOAN -> all.filter { it.kind != "credit" }
                    else -> all
                }
                // Transfer destination and card payment source are both cash accounts.
                else -> all.filter { it.kind != "credit" && it.id != draft.accountId }
            }
        }
    }
    val favorites = options.filter { it.favorite }
    val rest = options.filterNot { it.favorite }
    WearList {
        item {
            Text(
                text = if (isCategory) "選擇分類" else "選擇帳戶",
                style = MaterialTheme.typography.title3,
            )
        }
        if (options.isEmpty()) {
            item {
                Text(
                    text = "尚無資料，請先與手機同步",
                    style = MaterialTheme.typography.caption1,
                    textAlign = TextAlign.Center,
                )
            }
        }
        if (favorites.isNotEmpty()) {
            item { Text("常用", style = MaterialTheme.typography.caption2) }
            items(favorites) { option ->
                Chip(
                    onClick = {
                        applyPick(draft, option.id, option.name)
                        onDone()
                    },
                    label = {
                        Text(
                            if (isCategory) {
                                option.name
                            } else {
                                option.name + " " + formatTwd(option.balanceMinor)
                            }
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        if (rest.isNotEmpty()) {
            item { Text("全部", style = MaterialTheme.typography.caption2) }
            items(rest) { option ->
                Chip(
                    onClick = {
                        applyPick(draft, option.id, option.name)
                        onDone()
                    },
                    label = { Text(option.name + if (option.recent) " ·" else "") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

private fun applyPick(draft: WearDraftState, id: String, name: String) {
    when (draft.pickerTarget) {
        PickerTarget.ACCOUNT -> {
            draft.accountId = id
            draft.accountName = name
        }
        PickerTarget.PEER_ACCOUNT, PickerTarget.SOURCE_ACCOUNT -> {
            draft.peerAccountId = id
            draft.peerAccountName = name
        }
        PickerTarget.CATEGORY -> {
            draft.categoryId = id
            draft.categoryName = name
        }
    }
}

@Composable
fun TagsScreen(repo: WearSyncRepository, draft: WearDraftState, onDone: () -> Unit) {
    val known = remember { recentTags(repo) }
    WearList {
        item { Text("標籤", style = MaterialTheme.typography.title3) }
        if (known.isEmpty()) {
            item {
                Text(
                    text = "最近交易沒有標籤可選",
                    style = MaterialTheme.typography.caption1,
                    textAlign = TextAlign.Center,
                )
            }
        }
        items(known) { tag ->
            val checked = draft.tags.contains(tag)
            ToggleChip(
                checked = checked,
                onCheckedChange = {
                    if (checked) draft.tags.remove(tag) else draft.tags.add(tag)
                },
                label = { Text(tag) },
                toggleControl = { Checkbox(checked = checked) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        item {
            Button(onClick = onDone, modifier = Modifier.fillMaxWidth()) { Text("完成") }
        }
    }
}

@Composable
fun TimeScreen(draft: WearDraftState, onDone: () -> Unit) {
    WearList {
        item { Text("交易時間", style = MaterialTheme.typography.title3) }
        item {
            Text(
                text = formatLocalShort(isoUtc(draft.occurredAtMillis)),
                style = MaterialTheme.typography.title2,
            )
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                CompactChip(
                    onClick = { draft.occurredAtMillis -= DAY_MILLIS },
                    label = { Text("-1天") },
                )
                CompactChip(
                    onClick = { draft.occurredAtMillis += DAY_MILLIS },
                    label = { Text("+1天") },
                )
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                CompactChip(
                    onClick = { draft.occurredAtMillis -= HOUR_MILLIS },
                    label = { Text("-1時") },
                )
                CompactChip(
                    onClick = { draft.occurredAtMillis += HOUR_MILLIS },
                    label = { Text("+1時") },
                )
            }
        }
        item {
            Chip(
                onClick = { draft.occurredAtMillis = System.currentTimeMillis() },
                label = { Text("現在") },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        item {
            Button(onClick = onDone, modifier = Modifier.fillMaxWidth()) { Text("完成") }
        }
    }
}

/**
 * Note entry. Voice uses the system recognizer activity, so no RECORD_AUDIO
 * permission is requested here; a device without a recognizer just shows a hint.
 */
@Composable
fun NoteScreen(draft: WearDraftState, onDone: () -> Unit) {
    var hint by remember { mutableStateOf("") }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val spoken = result.data
                ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                ?.firstOrNull()
                ?.trim()
                .orEmpty()
            if (spoken.isNotEmpty()) {
                draft.note = spoken.take(200)
                hint = ""
            } else {
                hint = "沒有聽到內容"
            }
        }
    }
    WearList {
        item { Text("備註", style = MaterialTheme.typography.title3) }
        item {
            Text(
                text = draft.note.ifBlank { "（空白）" },
                style = MaterialTheme.typography.body2,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 8.dp),
            )
        }
        if (hint.isNotBlank()) {
            item { Text(hint, style = MaterialTheme.typography.caption2) }
        }
        item {
            Chip(
                onClick = {
                    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                        putExtra(
                            RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                            RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
                        )
                        putExtra(RecognizerIntent.EXTRA_PROMPT, "說出備註")
                    }
                    val launched = runCatching { launcher.launch(intent) }.isSuccess
                    if (!launched) hint = "此手錶沒有語音輸入"
                },
                label = { Text("語音輸入") },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        item {
            Chip(
                onClick = { draft.note = "" },
                label = { Text("清除") },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        item {
            Button(onClick = onDone, modifier = Modifier.fillMaxWidth()) { Text("完成") }
        }
    }
}

@Composable
fun RecentScreen(repo: WearSyncRepository, refreshTick: Int, onOpenTx: (String) -> Unit) {
    val outbox by repo.observeRecent().collectAsState(initial = emptyList())
    val phoneRecent = remember(refreshTick) { repo.cacheStore().recentTxs() }
    WearList {
        item { Text("待送／最近", style = MaterialTheme.typography.title3) }
        items(outbox) { row -> OutboxRow(row) }
        if (phoneRecent.isNotEmpty()) {
            item { Text("手機最近", style = MaterialTheme.typography.caption2) }
        }
        items(phoneRecent) { tx ->
            val editable = tx.optBoolean("editable", false)
            Chip(
                onClick = { if (editable) onOpenTx(tx.optString("id", "")) },
                enabled = editable,
                label = {
                    Text(
                        typeLabel(tx.optString("type", "")) + " " +
                            formatTwd(Math.abs(tx.optLong("amountMinor", 0L)))
                    )
                },
                secondaryLabel = {
                    Text(
                        listOf(
                            tx.optString("categoryName", ""),
                            tx.optString("note", ""),
                            formatLocalShort(tx.optString("occurredAt", "")),
                        ).filter { it.isNotBlank() }.joinToString(" · ")
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun OutboxRow(row: OutboxEntity) {
    Text(
        text = opLabel(row.op) + " " + typeLabel(row.type) + " " +
            formatTwd(row.amountMinor) + " · " + statusLabel(row.status),
        style = MaterialTheme.typography.body2,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp),
    )
}

@Composable
fun TransactionDetailScreen(
    repo: WearSyncRepository,
    txId: String,
    onEdit: (JSONObject) -> Unit,
    onDelete: (String) -> Unit,
) {
    val tx = remember(txId) {
        repo.cacheStore().recentTxs().firstOrNull { it.optString("id", "") == txId }
    }
    var confirming by remember { mutableStateOf(false) }
    WearList {
        item { Text("交易", style = MaterialTheme.typography.title3) }
        if (tx == null) {
            item {
                Text(
                    text = "找不到這筆交易，請重新同步",
                    style = MaterialTheme.typography.caption1,
                    textAlign = TextAlign.Center,
                )
            }
        } else {
            item {
                Text(
                    text = typeLabel(tx.optString("type", "")) + " " +
                        formatTwd(Math.abs(tx.optLong("amountMinor", 0L))),
                    style = MaterialTheme.typography.title2,
                )
            }
            item {
                Text(
                    text = listOf(
                        tx.optString("accountName", ""),
                        tx.optString("categoryName", ""),
                        formatLocalShort(tx.optString("occurredAt", "")),
                    ).filter { it.isNotBlank() }.joinToString(" · "),
                    style = MaterialTheme.typography.caption1,
                    textAlign = TextAlign.Center,
                )
            }
            if (tx.optString("note", "").isNotBlank()) {
                item { Text(tx.optString("note", ""), style = MaterialTheme.typography.body2) }
            }
            item {
                Chip(
                    onClick = { onEdit(tx) },
                    label = { Text("修改") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            item {
                Chip(
                    onClick = {
                        if (confirming) onDelete(txId) else confirming = true
                    },
                    label = { Text(if (confirming) "再按一次確認刪除" else "刪除") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
fun LedgerScreen(repo: WearSyncRepository, onPick: (String) -> Unit) {
    val cache = repo.cacheStore()
    val ledgers = remember { cache.ledgers() }
    val activeId = cache.activeLedgerId()
    WearList {
        item { Text("選擇帳本", style = MaterialTheme.typography.title3) }
        if (ledgers.isEmpty()) {
            item {
                Text(
                    text = "請先與手機同步帳本",
                    style = MaterialTheme.typography.caption1,
                    textAlign = TextAlign.Center,
                )
            }
        }
        items(ledgers) { ledger ->
            Chip(
                onClick = { onPick(ledger.id) },
                label = { Text(ledger.name + if (ledger.id == activeId) " ✓" else "") },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
fun TemplatesScreen(
    repo: WearSyncRepository,
    refreshTick: Int,
    onUse: (WearTemplate) -> Unit,
    onSaveCurrent: () -> Unit,
) {
    val templates = remember(refreshTick) { repo.cacheStore().templates() }
    WearList {
        item { Text("範本", style = MaterialTheme.typography.title3) }
        if (templates.isEmpty()) {
            item {
                Text(
                    text = "尚無範本；填好一筆後可存為範本",
                    style = MaterialTheme.typography.caption1,
                    textAlign = TextAlign.Center,
                )
            }
        }
        items(templates) { template ->
            Chip(
                onClick = { onUse(template) },
                label = { Text(template.label) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        item {
            Chip(
                onClick = onSaveCurrent,
                label = { Text("把目前輸入存為範本") },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
fun Numpad(onDigit: (String) -> Unit, onDot: () -> Unit, onBack: () -> Unit) {
    val rows = listOf(
        listOf("1", "2", "3"),
        listOf("4", "5", "6"),
        listOf("7", "8", "9"),
        listOf(".", "0", "⌫"),
    )
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        rows.forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                row.forEach { key ->
                    CompactChip(
                        onClick = {
                            when (key) {
                                "." -> onDot()
                                "⌫" -> onBack()
                                else -> onDigit(key)
                            }
                        },
                        label = { Text(key) },
                    )
                }
            }
        }
    }
}

private fun recentTags(repo: WearSyncRepository): List<String> {
    val tags = LinkedHashSet<String>()
    for (tx in repo.cacheStore().recentTxs()) {
        parseTagsJson(tx.optString("tagsJson", "")).forEach { tags.add(it) }
    }
    return tags.toList().take(12)
}

private fun recentCounterparties(repo: WearSyncRepository): List<String> {
    val names = LinkedHashSet<String>()
    for (tx in repo.cacheStore().recentTxs()) {
        if (tx.optString("originType", "") != "loan_payment") continue
        val note = tx.optString("note", "")
        val marker = "借貸建立："
        if (note.startsWith(marker)) {
            names.add(note.removePrefix(marker).trim())
        }
    }
    return names.toList().take(8)
}
