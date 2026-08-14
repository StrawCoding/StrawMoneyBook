package com.strawcoding.strawmoneybook.presentation

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import com.strawcoding.strawmoneybook.WearApp
import com.strawcoding.strawmoneybook.data.OutboxEntity
import com.strawcoding.strawmoneybook.sync.WearSyncRepository
import java.text.NumberFormat
import java.util.Locale
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val repo = (application as WearApp).syncRepository
        setContent {
            MaterialTheme {
                WearRoot(repo)
            }
        }
    }
}

@Composable
private fun WearRoot(repo: WearSyncRepository) {
    val nav = rememberSwipeDismissableNavController()
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) {
        runCatching {
            repo.requestHelloAndSnapshot()
            repo.flushPending()
        }
    }
    Scaffold(timeText = { TimeText() }) {
        SwipeDismissableNavHost(navController = nav, startDestination = "home") {
            composable("home") {
                HomeScreen(
                    repo = repo,
                    onQuickAdd = { nav.navigate("add") },
                    onRecent = { nav.navigate("recent") },
                    onRefresh = {
                        scope.launch {
                            runCatching {
                                repo.requestHelloAndSnapshot()
                                repo.flushPending()
                            }
                        }
                    },
                )
            }
            composable("add") {
                QuickAddScreen(
                    onSubmit = { type, amountYuan, note ->
                        scope.launch {
                            runCatching {
                                val minor = Math.round(amountYuan * 100.0)
                                repo.enqueueExpenseOrIncome(type, minor, note)
                                nav.popBackStack()
                            }
                        }
                    },
                )
            }
            composable("recent") {
                RecentScreen(repo = repo)
            }
        }
    }
}

@Composable
private fun HomeScreen(
    repo: WearSyncRepository,
    onQuickAdd: () -> Unit,
    onRecent: () -> Unit,
    onRefresh: () -> Unit,
) {
    val pending by repo.observePendingCount().collectAsState(initial = 0)
    val cache = repo.cacheStore()
    val spend = cache.todaySpendMinor()
    val nearby = cache.isNearby()
    val node = cache.nodeDisplayName()
    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            Text(
                text = "今日已花",
                style = MaterialTheme.typography.title3,
                textAlign = TextAlign.Center,
            )
        }
        item {
            Text(
                text = formatTwd(spend),
                style = MaterialTheme.typography.display3,
                textAlign = TextAlign.Center,
            )
        }
        item {
            Text(
                text = if (nearby) "已連線 ${node.ifBlank { "手機" }}" else "未連線（需靠近手機）",
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
        item {
            Button(onClick = onQuickAdd, modifier = Modifier.fillMaxWidth()) {
                Text("記一筆")
            }
        }
        item {
            Chip(onClick = onRecent, label = { Text("最近／待送") }, modifier = Modifier.fillMaxWidth())
        }
        item {
            Chip(onClick = onRefresh, label = { Text("重新同步") }, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun QuickAddScreen(onSubmit: (type: String, amountYuan: Double, note: String?) -> Unit) {
    var type by remember { mutableStateOf("expense") }
    var digits by remember { mutableStateOf("") }
    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize().padding(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        item {
            Text(if (type == "expense") "支出" else "收入", style = MaterialTheme.typography.title2)
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Chip(onClick = { type = "expense" }, label = { Text("支出") })
                Chip(onClick = { type = "income" }, label = { Text("收入") })
            }
        }
        item {
            Text(
                text = if (digits.isEmpty()) "0" else digits,
                style = MaterialTheme.typography.display3,
            )
        }
        item {
            Numpad(
                onDigit = { d ->
                    if (digits.length < 8) digits += d
                },
                onDot = {
                    if (!digits.contains('.')) {
                        digits = if (digits.isEmpty()) "0." else "$digits."
                    }
                },
                onBack = { digits = digits.dropLast(1) },
            )
        }
        item {
            Button(
                onClick = {
                    val amount = digits.toDoubleOrNull() ?: 0.0
                    if (amount > 0) onSubmit(type, amount, null)
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = (digits.toDoubleOrNull() ?: 0.0) > 0,
            ) {
                Text("送出")
            }
        }
    }
}

@Composable
private fun Numpad(onDigit: (String) -> Unit, onDot: () -> Unit, onBack: () -> Unit) {
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
                    Chip(
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

@Composable
private fun RecentScreen(repo: WearSyncRepository) {
    val outbox by repo.observeRecent().collectAsState(initial = emptyList())
    val phoneRecent = repo.cacheStore().recentTxs()
    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        item { Text("待送／最近", style = MaterialTheme.typography.title3) }
        items(outbox) { row ->
            OutboxRow(row)
        }
        items(phoneRecent) { tx ->
            Text(
                text = "${tx.optString("type")} ${formatTwd(Math.abs(tx.optLong("amountMinor")))} ${tx.optString("note")}",
                style = MaterialTheme.typography.body2,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp),
            )
        }
    }
}

@Composable
private fun OutboxRow(row: OutboxEntity) {
    Text(
        text = "${row.type} ${formatTwd(row.amountMinor)} · ${row.status}",
        style = MaterialTheme.typography.body2,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp),
    )
}

private fun formatTwd(minor: Long): String {
    val yuan = minor / 100.0
    return NumberFormat.getCurrencyInstance(Locale.TAIWAN).format(yuan)
}
