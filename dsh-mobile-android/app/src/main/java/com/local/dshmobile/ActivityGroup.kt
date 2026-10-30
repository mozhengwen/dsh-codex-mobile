package com.local.dshmobile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun ActivityGroup(entry: ConversationEntry.Activity, running: Boolean) {
    var expanded by rememberSaveable(entry.key) { mutableStateOf(false) }
    val tools = entry.items.filter { it.kind == "tool" }
    val failures = tools.count { it.status == "error" }
    val active = running && (entry.items.any { it.id == "live-reasoning" } || tools.any { it.status != "ok" && it.status != "error" })
    val label = when {
        failures > 0 -> "${tools.size} 项操作 · $failures 项失败"
        active && tools.isEmpty() -> "正在思考"
        active -> "正在执行 · ${tools.size} 项操作"
        tools.isNotEmpty() -> "已执行 ${tools.size} 项操作"
        else -> "思考过程"
    }
    val secondary = MaterialTheme.colorScheme.onSurfaceVariant
    Column(Modifier.fillMaxWidth()) {
        // A quiet disclosure row, like the desktop timeline. No filled task cards.
        Row(
            Modifier.fillMaxWidth().clickable { expanded = !expanded }
                .padding(vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (active) CircularProgressIndicator(Modifier.size(14.dp), color = MaterialTheme.colorScheme.secondary, strokeWidth = 1.5.dp)
            else Icon(if (failures > 0) Icons.Outlined.ErrorOutline else Icons.Outlined.Check,
                null, Modifier.size(16.dp), tint = if (failures > 0) MaterialTheme.colorScheme.error else secondary)
            Spacer(Modifier.width(8.dp))
            Text(label, fontSize = 13.sp, lineHeight = 20.sp, color = secondary, modifier = Modifier.weight(1f))
            if (!expanded && tools.isNotEmpty()) {
                Text(tools.last().toolName.orEmpty(), color = secondary, fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.widthIn(max = 120.dp).padding(start = 12.dp))
            }
            Spacer(Modifier.width(6.dp))
            Icon(if (expanded) Icons.Outlined.ExpandMore else Icons.Outlined.ChevronRight,
                if (expanded) "收起执行详情" else "展开执行详情", Modifier.size(16.dp), tint = secondary)
        }
        if (expanded) {
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
                Box(Modifier.padding(start = 7.dp, end = 16.dp).width(1.dp)
                    .fillMaxHeight().background(MaterialTheme.colorScheme.outline))
                Column(Modifier.weight(1f)) {
                    entry.items.forEach { item ->
                        key(item.id) {
                            if (item.kind == "tool") ToolDetail(item, running)
                            else ReasoningDetail(item)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ReasoningDetail(item: ChatItem) {
    var expanded by rememberSaveable(item.id) { mutableStateOf(false) }
    val color = MaterialTheme.colorScheme.onSurfaceVariant
    Column(Modifier.fillMaxWidth().padding(bottom = 6.dp)) {
        Row(Modifier.fillMaxWidth().clickable { expanded = !expanded }.padding(vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("思考过程", color = color, fontSize = 12.sp, modifier = Modifier.weight(1f))
            Icon(if (expanded) Icons.Outlined.ExpandMore else Icons.Outlined.ChevronRight,
                if (expanded) "收起思考过程" else "展开思考过程", Modifier.size(16.dp), tint = color)
        }
        if (expanded) SelectionContainer {
            Text(item.reasoning, color = color, fontSize = 13.sp, lineHeight = 22.sp,
                modifier = Modifier.heightIn(max = 300.dp).verticalScroll(rememberScrollState()).padding(bottom = 12.dp))
        }
    }
}

@Composable
private fun ToolDetail(item: ChatItem, running: Boolean) {
    var expanded by rememberSaveable(item.id) { mutableStateOf(false) }
    val secondary = MaterialTheme.colorScheme.onSurfaceVariant
    val failed = item.status == "error"
    val active = running && item.status != "ok" && !failed
    Column(Modifier.fillMaxWidth().padding(bottom = 4.dp)) {
        Row(Modifier.fillMaxWidth().clickable { expanded = !expanded }.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            val web = item.toolName.orEmpty().let { it.contains("网页") || it.contains("web", ignoreCase = true) || it.contains("search", ignoreCase = true) }
            Icon(if (web) Icons.Outlined.Language else Icons.Outlined.Terminal, null, Modifier.size(16.dp), tint = secondary)
            Spacer(Modifier.width(8.dp))
            Text(item.toolName ?: "工具", fontSize = 12.sp, color = MaterialTheme.colorScheme.onBackground,
                fontFamily = FontFamily.Monospace, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(if (failed) "失败" else if (active) "执行中" else if (item.status == "ok") "完成" else "已结束",
                color = if (failed) MaterialTheme.colorScheme.error else secondary, fontSize = 11.sp)
            Spacer(Modifier.width(8.dp))
            Icon(if (expanded) Icons.Outlined.ExpandMore else Icons.Outlined.ChevronRight,
                if (expanded) "收起 ${item.toolName} 详情" else "展开 ${item.toolName} 详情", Modifier.size(16.dp), tint = secondary)
        }
        if (expanded) {
            if (!item.args.isNullOrBlank()) DetailBlock("参数", item.args)
            if (!item.result.isNullOrBlank()) DetailBlock("结果", item.result)
            if (!item.error.isNullOrBlank()) Text(item.error, fontSize = 13.sp, lineHeight = 21.sp,
                color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(vertical = 8.dp))
        }
    }
}

@Composable
private fun DetailBlock(label: String, content: String) {
    Surface(color = MaterialTheme.colorScheme.surfaceVariant, contentColor = MaterialTheme.colorScheme.onSurface,
        shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text(label, fontSize = 11.sp, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(6.dp))
            SelectionContainer {
                Text(content, fontSize = 12.sp, lineHeight = 19.sp, fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.heightIn(max = 260.dp).verticalScroll(rememberScrollState()).horizontalScroll(rememberScrollState()))
            }
        }
    }
}
