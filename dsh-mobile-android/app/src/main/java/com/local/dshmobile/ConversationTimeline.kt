package com.local.dshmobile
import androidx.compose.runtime.Immutable

/** Keep execution details together while preserving every visible message boundary. */
sealed interface ConversationEntry {
    val key: String
    @Immutable data class Message(val item: ChatItem) : ConversationEntry {
        override val key = "message:${item.id}"
    }
    @Immutable data class Activity(val items: List<ChatItem>) : ConversationEntry {
        override val key = "activity:${items.first().id}"
    }
}

fun conversationEntries(items: List<ChatItem>, live: LiveText? = null): List<ConversationEntry> {
    val result = mutableListOf<ConversationEntry>()
    val activity = mutableListOf<ChatItem>()
    fun flush() {
        if (activity.isNotEmpty()) {
            result += ConversationEntry.Activity(activity.toList())
            activity.clear()
        }
    }
    for (item in items) {
        when {
            item.kind == "tool" -> activity += item
            item.kind == "assistant" -> {
                if (item.reasoning.isNotBlank()) activity += item.copy(text = "", interrupted = false)
                if (item.text.isNotBlank() || item.interrupted) {
                    flush()
                    result += ConversationEntry.Message(item.copy(reasoning = ""))
                }
            }
            else -> {
                flush()
                result += ConversationEntry.Message(item)
            }
        }
    }
    if (!live?.reasoning.isNullOrBlank()) {
        activity += ChatItem(id = "live-reasoning", kind = "assistant", reasoning = live!!.reasoning)
    }
    flush()
    return result
}
