package com.local.dshmobile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.net.URI

internal fun connectionName(base: String) = if (base.trimEnd('/').endsWith("/backends/codex")) "Codex" else "DSH"
internal fun connectionHost(base: String) = runCatching { URI(base).host }.getOrNull() ?: base
internal fun backendAddress(base: String, codex: Boolean): String =
    (MobileApi.normalizeBase(base) ?: "").removeSuffix("/backends/codex") + if (codex) "/backends/codex" else ""

@Composable
internal fun BackendMark(codex: Boolean, modifier: Modifier = Modifier.size(24.dp)) {
    if (codex) Icon(Icons.Outlined.Terminal, null, modifier)
    else Icon(painterResource(R.drawable.dsh_mark), null, modifier)
}

@Composable
internal fun ConnectionSwitcher(state: UiState, viewModel: AppViewModel, compact: Boolean = false) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        Surface(onClick = { expanded = true }, enabled = !state.sending && !state.addingImages, color = if (compact) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.background,
            shape = RoundedCornerShape(10.dp), modifier = Modifier.semantics { contentDescription = "切换 DSH / Codex 连接" }) {
            Row(Modifier.padding(horizontal = if (compact) 8.dp else 4.dp, vertical = if (compact) 5.dp else 8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (!compact) { BackendMark(state.isCodex); Spacer(Modifier.width(9.dp)) }
                Text(state.backendName, fontSize = if (compact) 11.sp else 19.sp, lineHeight = if (compact) 16.sp else 26.sp, fontWeight = FontWeight.SemiBold)
                Icon(Icons.Filled.ExpandMore, null, Modifier.padding(start = 4.dp).size(if (compact) 15.dp else 19.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }, modifier = Modifier.widthIn(min = 260.dp, max = 340.dp)) {
            Text("切换连接", Modifier.padding(horizontal = 16.dp, vertical = 8.dp), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            state.connections.distinct().sortedBy { connectionName(it) }.forEach { base ->
                DropdownMenuItem(
                    text = { Column { Text(connectionName(base), fontWeight = FontWeight.Medium); Text(connectionHost(base), fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant) } },
                    leadingIcon = { BackendMark(connectionName(base) == "Codex", Modifier.size(21.dp)) },
                    trailingIcon = { if (base == state.baseUrl) Icon(Icons.Filled.Check, "当前连接", Modifier.size(18.dp), tint = MaterialTheme.colorScheme.secondary) },
                    onClick = { expanded = false; if (base != state.baseUrl) viewModel.selectConnection(base) },
                    modifier = Modifier.semantics { contentDescription = "切换到 ${connectionName(base)} · ${connectionHost(base)}" },
                )
            }
            listOf(false, true).filter { codex -> state.connections.none { (connectionName(it) == "Codex") == codex } }.forEach { codex ->
                DropdownMenuItem(text = { Column { Text(if (codex) "Codex" else "DSH"); Text("尚未连接 · 点击配对", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) } },
                    leadingIcon = { BackendMark(codex, Modifier.size(21.dp)) }, onClick = { expanded = false; viewModel.addConnection(backendAddress(state.baseUrl, codex)) })
            }
            HorizontalDivider(Modifier.padding(vertical = 4.dp), color = MaterialTheme.colorScheme.outlineVariant)
            DropdownMenuItem(text = { Text("添加连接") }, leadingIcon = { Icon(Icons.Filled.Add, null) }, onClick = { expanded = false; viewModel.addConnection() })
        }
    }
}
