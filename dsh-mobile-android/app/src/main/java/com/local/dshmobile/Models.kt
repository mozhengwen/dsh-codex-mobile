package com.local.dshmobile

import kotlinx.serialization.Serializable
import androidx.compose.runtime.Immutable

@Serializable
data class SessionDto(
    val id: String,
    val title: String = "",
    val cwd: String = "",
    val updatedAt: Long = 0L,
    val running: Boolean = false,
    val blank: Boolean = false,
    val parentId: String? = null,
    val projectId: String? = null,
    val hostId: String = "local",
)

@Serializable
@Immutable
data class ChatItem(
    val id: String,
    val kind: String,
    val text: String = "",
    val reasoning: String = "",
    val toolName: String? = null,
    val toolCallId: String? = null,
    val args: String? = null,
    val result: String? = null,
    val error: String? = null,
    val status: String? = null,
    val interrupted: Boolean = false,
    val time: Long = 0L,
    val images: List<AttachmentDto> = emptyList(),
    val streaming: Boolean = false,
)

@Serializable
data class LiveText(val text: String = "", val reasoning: String = "")

@Serializable
data class QuestionOption(val label: String, val description: String? = null)

@Serializable
data class Question(
    val id: String,
    val question: String,
    val detail: String? = null,
    val header: String? = null,
    val options: List<QuestionOption>? = null,
    val multiSelect: Boolean = false,
)

@Serializable
data class Interaction(
    val id: String,
    val kind: String,
    val sessionId: String = "",
    val toolName: String? = null,
    val callId: String? = null,
    val reason: String = "",
    val prompt: String = "",
    val questions: List<Question>? = null,
    val createdAt: Long = 0L,
)

@Serializable
data class ItemPatch(
    val textAppend: String? = null,
    val baseLength: Int? = null,
    val toolName: String? = null,
    val streaming: Boolean? = null,
    val args: String? = null,
    val status: String? = null,
    val result: String? = null,
    val error: String? = null,
    val text: String? = null,
    val reasoning: String? = null,
)

@Serializable
data class ServerFrame(
    val historyNotice: String? = null,
    val type: String,
    val item: ChatItem? = null,
    val id: String? = null,
    val patch: ItemPatch? = null,
    val kind: String? = null,
    val text: String? = null,
    val running: Boolean? = null,
    val interaction: Interaction? = null,
    val sessionId: String? = null,
    val title: String? = null,
    val cwd: String? = null,
    val cursor: Long? = null,
    val hasMore: Boolean? = null,
    val items: List<ChatItem>? = null,
    val live: LiveText? = null,
    val interactions: List<Interaction>? = null,
    val message: String? = null,
)

@Serializable
data class SessionsResponse(val sessions: List<SessionDto> = emptyList())

@Serializable
data class WorkspaceDto(val id: String, val title: String = "", val path: String = "", val hostId: String = "local")

@Serializable
@Immutable
data class AttachmentDto(val id: String, val name: String = "图片", val mimeType: String = "image/jpeg", val size: Long = 0, val url: String = "")

@Serializable
data class WorkspacesResponse(
    val workspaces: List<WorkspaceDto> = emptyList(),
    val defaultDirectory: String = "",
)

@Serializable
data class ErrorResponse(val error: String? = null)

@Serializable data class ModelEffort(val id: String, val name: String = "")
@Serializable data class ModelOption(val provider: String, val id: String, val name: String = "", val providerName: String = "", val efforts: List<ModelEffort> = emptyList(), val defaultEffort: String? = null)
@Serializable data class ModelSelection(val provider: String, val model: String, val reasoningEffort: String? = null)
@Serializable data class ModelSettings(val models: List<ModelOption> = emptyList(), val selected: ModelSelection? = null)

@Serializable
data class QuestionAnswer(
    val id: String,
    val selected: List<String> = emptyList(),
    val custom: String? = null,
)
