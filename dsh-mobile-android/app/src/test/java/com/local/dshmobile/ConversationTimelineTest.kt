package com.local.dshmobile

import org.junit.Assert.*
import org.junit.Test

class ConversationTimelineTest {
    @Test fun numberedInstructionsStayOnSeparateRows() {
        val blocks = parseMarkdown("现在需要做\n\n1. 刷新电脑端\n2. 扫描配对码\n3. 开始对话")
        assertEquals(listOf("1.", "2.", "3."), blocks.filterIsInstance<MdBlock.Bullet>().map { it.marker })
        assertEquals(listOf("刷新电脑端", "扫描配对码", "开始对话"), blocks.filterIsInstance<MdBlock.Bullet>().map { it.text })
    }
    @Test fun longExecutionSequenceCollapsesWithoutLosingDetails() {
        val items = (0..7).flatMap { i -> listOf(
            ChatItem("r$i", "assistant", reasoning = "reason $i"),
            ChatItem("t$i", "tool", toolName = "pwsh", args = "arg $i", result = "result $i", status = "ok"),
        ) }
        val entries = conversationEntries(items)
        assertEquals(1, entries.size)
        assertEquals(items, (entries.single() as ConversationEntry.Activity).items)
    }

    @Test fun proseAndUserMessagesKeepTheirExactPlaceInTheConversation() {
        val entries = conversationEntries(listOf(
            ChatItem("u", "user", text = "check"),
            ChatItem("a", "assistant", text = "I will check.", reasoning = "plan"),
            ChatItem("t", "tool", toolName = "read", status = "error", error = "denied"),
            ChatItem("b", "assistant", text = "Permission denied."),
        ))
        assertEquals(listOf("message:u", "activity:a", "message:a", "activity:t", "message:b"), entries.map { it.key })
        assertEquals("I will check.", (entries[2] as ConversationEntry.Message).item.text)
        assertEquals("plan", (entries[1] as ConversationEntry.Activity).items.single().reasoning)
        assertEquals("denied", (entries[3] as ConversationEntry.Activity).items.single().error)
    }

    @Test fun liveReasoningJoinsActivityAndDoesNotDuplicateTheLiveAnswer() {
        val live = LiveText(text = "answer", reasoning = "live plan")
        val entries = conversationEntries(listOf(ChatItem("t", "tool", status = "running")), live)
        val activity = entries.single() as ConversationEntry.Activity
        assertEquals(listOf("t", "live-reasoning"), activity.items.map { it.id })
        assertTrue(activity.items.all { it.text.isEmpty() })
        assertEquals("live plan", activity.items.last().reasoning)
    }

    @Test fun interruptionIsVisibleEvenWithoutAssistantProse() {
        val entries = conversationEntries(listOf(ChatItem("a", "assistant", reasoning = "plan", interrupted = true)))
        assertEquals(2, entries.size)
        assertTrue((entries.last() as ConversationEntry.Message).item.interrupted)
    }
}
