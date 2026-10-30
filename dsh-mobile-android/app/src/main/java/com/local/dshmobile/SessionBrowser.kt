package com.local.dshmobile

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
internal fun SessionBrowser(state: UiState, viewModel: AppViewModel) {
    val prefs = LocalContext.current.getSharedPreferences("dsh-mobile", 0)
    var grouped by rememberSaveable { mutableStateOf(prefs.getBoolean("group-by-project", true)) }
    var search by rememberSaveable { mutableStateOf("") }
    var runningOnly by rememberSaveable { mutableStateOf(false) }
    var collapsed by rememberSaveable { mutableStateOf(prefs.getStringSet("collapsed-projects", emptySet()).orEmpty().toList()) }
    val filtered = remember(state.sessions, runningOnly) { state.sessions.filter { !runningOnly || it.running } }
    val groups = remember(filtered, state.workspaces, search) { projectGroups(filtered, state.workspaces, search) }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                Row(Modifier.padding(3.dp)) {
                    listOf(true to "项目", false to "最近").forEach { (mode, title) ->
                        Surface(onClick = { grouped = mode; prefs.edit().putBoolean("group-by-project", mode).apply() }, shape = RoundedCornerShape(8.dp), color = if (grouped == mode) MaterialTheme.colorScheme.background else MaterialTheme.colorScheme.surfaceVariant) {
                            Text(title, Modifier.padding(horizontal = 18.dp, vertical = 9.dp), fontSize = 13.sp, fontWeight = if (grouped == mode) FontWeight.SemiBold else FontWeight.Normal, color = if (grouped == mode) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
            Spacer(Modifier.weight(1f))
            FilterChip(selected = runningOnly, onClick = { runningOnly = !runningOnly }, label = { Text("进行中 ${state.sessions.count { it.running }}", fontSize = 11.sp) })
        }
        TextField(value = search, onValueChange = { search = it }, placeholder = { Text("搜索任务或项目", fontSize = 13.sp) }, singleLine = true,
            leadingIcon = { Icon(Icons.Filled.Search, null, Modifier.size(19.dp)) },
            trailingIcon = { if (search.isNotEmpty()) IconButton(onClick = { search = "" }) { Icon(Icons.Filled.Close, "清除搜索", Modifier.size(18.dp)) } },
            shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp), textStyle = MaterialTheme.typography.bodySmall,
            colors = TextFieldDefaults.colors(focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant, unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant, focusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent, unfocusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent))
        state.sessionsError?.let { InlineNotice(it, "重试", viewModel::refreshSessions) }
        if (!state.loadingSessions || state.sessions.isNotEmpty()) Text(if (search.isNotBlank() || runningOnly) "找到 ${groups.sumOf { it.sessions.size }} 个任务" else "${state.sessions.size} 个任务 · ${groups.size} 个项目", Modifier.padding(horizontal = 22.dp, vertical = 9.dp), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (state.sessions.isEmpty() && state.loadingSessions) {
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) { Text("正在加载任务…", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp) }
        } else LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(bottom = 30.dp)) {
            if (groups.isEmpty()) item {
                Column(Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 54.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(if (search.isNotBlank()) Icons.Filled.Search else Icons.Outlined.FolderOpen, null, Modifier.size(36.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(16.dp))
                    Text(if (search.isNotBlank()) "没有找到相关任务" else if (runningOnly) "暂时没有进行中的任务" else if (state.sessionsError != null) "任务暂未加载" else "从一个新任务开始", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                    Spacer(Modifier.height(8.dp))
                    Text(if (search.isNotBlank()) "试试其他任务名称、项目名或工作目录。" else if (runningOnly) "关闭筛选即可查看全部任务。" else "选择电脑上的项目，随时在手机上继续。", fontSize = 12.sp, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(16.dp))
                    if (search.isNotBlank() || runningOnly) TextButton(onClick = { search = ""; runningOnly = false }) { Text("查看全部任务") }
                    else if (state.sessionsError == null) Button(onClick = viewModel::chooseWorkspace) { Text("新建任务") }
                }
            }
            if (grouped) {
                for (group in groups) {
                    item(key = "group:" + group.id) {
                        Row(Modifier.fillMaxWidth().clickable {
                            collapsed = if (group.id in collapsed) collapsed - group.id else collapsed + group.id
                            prefs.edit().putStringSet("collapsed-projects", collapsed.toSet()).apply()
                        }.padding(horizontal = 22.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.FolderOpen, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(group.title, fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                if (group.path.isNotBlank()) Text(group.path, fontSize = 10.sp, lineHeight = 16.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            Text("${group.sessions.size}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.width(10.dp))
                            Icon(if (group.id in collapsed) Icons.Filled.ExpandMore else Icons.Filled.ExpandLess, if (group.id in collapsed) "展开项目" else "折叠项目", Modifier.size(17.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    if (group.id !in collapsed) items(group.sessions, key = { it.id }) { session -> SessionRow(session, showDirectory = false) { viewModel.openSession(session) } }
                    item(key = "separator:" + group.id) { Spacer(Modifier.height(8.dp)); HorizontalDivider(Modifier.padding(horizontal = 22.dp), color = MaterialTheme.colorScheme.outlineVariant) }
                }
            } else items(groups.flatMap { it.sessions }.sortedByDescending { it.updatedAt }, key = { it.id }) { session -> SessionRow(session) { viewModel.openSession(session) } }
        }
    }
}

@Composable
internal fun InlineNotice(text: String, action: String? = null, onAction: () -> Unit = {}) {
    Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
        Row(Modifier.padding(start = 12.dp, end = 4.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(text, Modifier.weight(1f).padding(vertical = 5.dp), fontSize = 11.sp, lineHeight = 17.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (action != null) TextButton(onClick = onAction) { Text(action, fontSize = 11.sp) }
        }
    }
}
