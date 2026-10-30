package com.local.dshmobile

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal fun effortLabel(id: String?): String = when(id) { null, "" -> "自动"; "none" -> "关闭"; "minimal" -> "最低"; "low" -> "低"; "medium" -> "中"; "high" -> "高"; "xhigh" -> "很高"; "max" -> "Max"; "ultra" -> "Ultra"; else -> id }

@Composable
internal fun ModelDialog(state: UiState, viewModel: AppViewModel, onDismiss: () -> Unit) {
    val settings = state.modelSettings
    var selection by remember(settings?.selected, settings?.models) { mutableStateOf(settings?.selected) }
    var modelMenu by remember { mutableStateOf(false) }
    var effortMenu by remember { mutableStateOf(false) }
    var submitted by remember { mutableStateOf(false) }
    val model = settings?.models?.find { it.id == selection?.model && it.provider == selection?.provider }
    LaunchedEffect(submitted, state.savingModel, state.modelError) { if (submitted && !state.savingModel && state.modelError == null) onDismiss() }
    AlertDialog(onDismissRequest = { if (!state.savingModel) onDismiss() }, title = { Text("模型与思考") },
        text = {
            Column {
                Text("当前任务的设置，下一条消息生效。", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(16.dp))
                if (state.loadingModels) LinearProgressIndicator(Modifier.fillMaxWidth())
                if (!state.loadingModels && state.modelError == null && settings?.models.isNullOrEmpty()) Text("电脑端暂未提供可用模型，请在电脑端配置后重新加载。", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                state.modelError?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 12.sp); TextButton(onClick = { submitted = false; viewModel.loadModels() }) { Text("重新加载") } }
                Text("模型", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Box {
                    OutlinedButton(onClick = { modelMenu = true }, enabled = !state.loadingModels && !state.savingModel && !settings?.models.isNullOrEmpty(), modifier = Modifier.fillMaxWidth()) {
                        Text(model?.name?.ifBlank { model.id } ?: selection?.model ?: "请选择模型", Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 13.sp)
                        Icon(Icons.Filled.ExpandMore, null, Modifier.size(18.dp))
                    }
                    DropdownMenu(expanded = modelMenu, onDismissRequest = { modelMenu = false }, modifier = Modifier.heightIn(max = 320.dp)) {
                        settings?.models?.forEach { option ->
                            DropdownMenuItem(text = { Column { Text(option.name.ifBlank { option.id }, fontSize = 13.sp); if (option.providerName.isNotBlank()) Text(option.providerName, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) } }, onClick = {
                                selection = ModelSelection(option.provider, option.id, selection?.reasoningEffort?.takeIf { effort -> option.efforts.any { it.id == effort } }); modelMenu = false
                            })
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                Text("思考等级", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Box {
                    OutlinedButton(onClick = { effortMenu = true }, enabled = !state.savingModel && !model?.efforts.isNullOrEmpty(), modifier = Modifier.fillMaxWidth()) {
                        Text(if (model != null && model.efforts.isEmpty()) "该模型无需选择思考等级" else effortLabel(selection?.reasoningEffort), Modifier.weight(1f), fontSize = 13.sp)
                        Icon(Icons.Filled.ExpandMore, null, Modifier.size(18.dp))
                    }
                    DropdownMenu(expanded = effortMenu, onDismissRequest = { effortMenu = false }) {
                        DropdownMenuItem(text = { Text("自动（模型默认）") }, onClick = { selection = selection?.copy(reasoningEffort = null); effortMenu = false })
                        model?.efforts?.forEach { effort -> DropdownMenuItem(text = { Text(effortLabel(effort.id)) }, onClick = { selection = selection?.copy(reasoningEffort = effort.id); effortMenu = false }) }
                    }
                }
            }
        },
        dismissButton = { TextButton(enabled = !state.savingModel, onClick = onDismiss) { Text("取消") } },
        confirmButton = { TextButton(enabled = model != null && !state.loadingModels && !state.savingModel, onClick = { selection?.let { submitted = true; viewModel.selectModel(it) } }) { if (state.savingModel) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text("保存") } })
}
