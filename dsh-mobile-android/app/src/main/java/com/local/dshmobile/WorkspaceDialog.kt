package com.local.dshmobile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.window.Dialog

@Composable
fun WorkspaceDialog(viewModel: AppViewModel, state: UiState) {
    val prefs = LocalContext.current.getSharedPreferences("dsh-mobile", 0)
    var selected by rememberSaveable { mutableStateOf(prefs.getString("last-workspace:${state.baseUrl}", null)) }
    var search by rememberSaveable { mutableStateOf("") }
    var custom by rememberSaveable { mutableStateOf(false) }
    var directory by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(state.loadingWorkspaces, state.workspaces) {
        if (!state.loadingWorkspaces && selected?.isNotEmpty() == true && state.workspaces.none { it.id == selected }) selected = null
    }
    Dialog(onDismissRequest = viewModel::dismissWorkspacePicker) {
        Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.background) {
            Column(Modifier.padding(20.dp)) {
                Text("新建任务", fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(8.dp))
                Text("选择电脑上的工作区", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(value = search, onValueChange = { search = it }, modifier = Modifier.fillMaxWidth(), placeholder = { Text("搜索项目或目录", fontSize = 12.sp) }, singleLine = true, shape = RoundedCornerShape(10.dp))
                Spacer(Modifier.height(12.dp))
                Column(Modifier.weight(1f, fill = false).heightIn(max = 360.dp).verticalScroll(rememberScrollState())) {
                    if (state.loadingWorkspaces) {
                        LinearProgressIndicator(Modifier.fillMaxWidth())
                        Text("正在读取桌面工作区…", Modifier.padding(vertical = 12.dp), fontSize = 13.sp)
                    }
                    state.workspaceError?.let {
                        Text(it, color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
                        TextButton(onClick = viewModel::chooseWorkspace) { Text("重新加载") }
                    }
                    val matches = state.workspaces.filter { search.isBlank() || it.title.contains(search, true) || it.path.contains(search, true) }
                    if (!state.loadingWorkspaces && matches.isEmpty() && state.workspaces.isNotEmpty()) Text("没有匹配的项目", Modifier.padding(vertical = 12.dp), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    matches.forEach { workspace ->
                        Surface(
                            modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp)
                                .clickable(enabled = !state.creatingSession) { selected = workspace.id; custom = false },
                            shape = RoundedCornerShape(10.dp),
                            color = if (!custom && selected == workspace.id) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                        ) {
                            Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                RadioButton(selected = !custom && selected == workspace.id, onClick = null)
                                Icon(Icons.Outlined.FolderOpen, null, Modifier.padding(horizontal = 8.dp).size(18.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(workspace.title.ifBlank { workspace.path }, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                                    Text(workspace.path, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                    if (!state.loadingWorkspaces && state.workspaceError == null && state.workspaces.isEmpty()) {
                        Text(if (state.isCodex) "电脑上还没有项目，可先创建不指定项目的任务。" else "电脑上还没有工作区，可使用默认目录或填写电脑目录。", fontSize = 13.sp)
                    }
                    Row(Modifier.fillMaxWidth().clickable(enabled = !state.creatingSession) { selected = ""; custom = false }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = selected == "" && !custom, onClick = null)
                        Column(Modifier.padding(start = 8.dp)) {
                            Text(if (state.isCodex) "不指定项目" else "默认目录", fontSize = 14.sp)
                            if (state.defaultDirectory.isNotBlank()) Text(state.defaultDirectory, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    if (!state.isCodex) TextButton(onClick = { custom = !custom }, enabled = !state.creatingSession) { Text("指定其他电脑目录") }
                    if (custom) OutlinedTextField(
                        value = directory, onValueChange = { directory = it },
                        label = { Text("电脑上的绝对路径") }, placeholder = { Text("例如 D:\\Projects\\my-app") },
                        modifier = Modifier.fillMaxWidth(), singleLine = true, enabled = !state.creatingSession,
                    )
                }
                Spacer(Modifier.height(18.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = viewModel::dismissWorkspacePicker, enabled = !state.creatingSession) { Text("取消") }
                    Spacer(Modifier.width(8.dp))
                    Button(
                        onClick = { viewModel.createSession(if (custom) null else selected, if (custom) directory.trim() else null) },
                        enabled = !state.loadingWorkspaces && !state.creatingSession && (if (custom) directory.isNotBlank() else selected != null),
                    ) {
                        if (state.creatingSession) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                        else Text("创建任务")
                    }
                }
            }
        }
    }
}
