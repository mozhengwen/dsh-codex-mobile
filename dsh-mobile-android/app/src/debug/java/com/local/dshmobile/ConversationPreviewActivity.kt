package com.local.dshmobile

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import kotlinx.serialization.json.Json

/** Debug-only entry point: exercises the production chat with a full transcript. */
class ConversationPreviewActivity : ComponentActivity() {
    private val viewModel: AppViewModel by viewModels()
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
        )
        if (android.os.Build.VERSION.SDK_INT >= 29) window.isNavigationBarContrastEnforced = false
        val frame = filesDir.resolve("conversation-preview.json").takeIf { it.exists() }?.let {
            Json { ignoreUnknownKeys = true }.decodeFromString<ServerFrame>(it.readText())
        }
        val tools = listOf("pwsh", "pwsh", "ssh_exec", "read", "ssh_exec", "plugin_manager", "plugin_manager")
        val fixture = listOf(ChatItem("u", "user", text = "现在扫描配对报错 503，帮我检查一下")) +
            tools.flatMapIndexed { i, name -> listOf(
                ChatItem("r$i", "assistant", reasoning = "检查电脑插件与中继服务状态，确认配对请求能够到达本机网关。"),
                ChatItem("t$i", "tool", toolName = name, status = "ok", args = "检查服务与连接状态", result = "服务运行正常，连接已恢复。"),
            ) } + listOf(ChatItem("answer", "assistant", text = "已经找到原因并恢复连接。\n\n### 检查结果\n- 中继服务运行正常\n- 电脑端插件已重新连接\n- 配对接口已恢复响应\n\n在手机上重新扫描电脑端的配对二维码即可。\n\n```text\nrelay: connected\ngateway: ready\n```"))
        val state = UiState(screen = Screen.Chat, current = SessionDto("preview"),
            title = frame?.title ?: "手机远控演示", cwd = frame?.cwd ?: "D:\\Projects\\example",
            connected = true, items = frame?.items ?: fixture, live = frame?.live, running = frame?.running ?: false)
        setContent { DshMobileTheme { ChatScreen(viewModel, state) } }
    }
}
