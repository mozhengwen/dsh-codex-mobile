package com.local.dshmobile
import org.junit.Assert.*
import org.junit.Test

class ItemUpdatesTest {
    @Test fun appendsUnicodeWithWireOffsetsAndCommitsWithoutLosingText() {
        val first = ChatItem("a", "assistant", text = "你好🙂", streaming = true)
        val next = ItemPatch(textAppend = "世界", baseLength = 4).applyTo(first)!!
        assertEquals("你好🙂世界", next.text)
        val done = ItemPatch(streaming = false, status = "ok").applyTo(next)!!
        assertFalse(done.streaming)
        assertEquals(next.text, done.text)
    }
    @Test fun rejectsMissingOrMismatchedBaseInsteadOfCorruptingTheReply() {
        val item = ChatItem("a", "assistant", text = "hello")
        assertNull(ItemPatch(textAppend = " world", baseLength = 2).applyTo(item))
        assertNull(ItemPatch(textAppend = " world").applyTo(item))
        assertEquals("hello", item.text)
    }
    @Test fun fullReplacementCanRecoverFromAnOutdatedAppendBase() {
        val item = ChatItem("a", "assistant", text = "old")
        assertEquals("new", ItemPatch(text = "new", textAppend = "ignored", baseLength = 0).applyTo(item)!!.text)
    }
    @Test fun toolMetadataAndResultsUpdateWithoutDroppingArguments() {
        val item = ChatItem("search", "tool", toolName = "搜索网页", args = "query", status = "running")
        val next = ItemPatch(toolName = "打开网页", result = "result", status = "ok").applyTo(item)!!
        assertEquals("打开网页", next.toolName); assertEquals("query", next.args); assertEquals("result", next.result)
    }
}
