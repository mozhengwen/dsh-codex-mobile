package com.local.dshmobile

/** The wire offsets and Kotlin lengths both count UTF-16 code units. */
internal fun ItemPatch.applyTo(item: ChatItem): ChatItem? {
    if (text == null && textAppend != null && baseLength != item.text.length) return null
    return item.copy(
        status = status ?: item.status,
        result = result ?: item.result,
        error = error ?: item.error,
        text = text ?: textAppend?.let { item.text + it } ?: item.text,
        toolName = toolName ?: item.toolName,
        args = args ?: item.args,
        streaming = streaming ?: item.streaming,
        reasoning = reasoning ?: item.reasoning,
    )
}
