package com.local.dshmobile

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal sealed interface MdBlock {
    data class Paragraph(val text: String) : MdBlock
    data class Heading(val text: String) : MdBlock
    data class Code(val language: String, val text: String) : MdBlock
    data class Bullet(val text: String, val marker: String = "•") : MdBlock
}

internal fun parseMarkdown(source: String): List<MdBlock> {
    val lines = source.replace("\r\n", "\n").split('\n')
    val blocks = mutableListOf<MdBlock>()
    val paragraph = StringBuilder()
    val code = StringBuilder()
    var codeLanguage = ""
    var inCode = false

    fun flushParagraph() {
        val text = paragraph.toString().trim()
        if (text.isNotEmpty()) blocks.add(MdBlock.Paragraph(text))
        paragraph.clear()
    }

    for (line in lines) {
        val trimmed = line.trim()
        if (inCode) {
            if (trimmed.startsWith("```")) {
                blocks.add(MdBlock.Code(codeLanguage, code.toString().trimEnd()))
                code.clear()
                codeLanguage = ""
                inCode = false
            } else {
                code.appendLine(line)
            }
            continue
        }
        if (trimmed.startsWith("```")) {
            flushParagraph()
            inCode = true
            codeLanguage = trimmed.removePrefix("```").trim()
            continue
        }
        if (trimmed.isEmpty()) {
            flushParagraph()
            continue
        }
        if (trimmed.startsWith("#")) {
            flushParagraph()
            blocks.add(MdBlock.Heading(trimmed.trimStart('#').trim()))
            continue
        }
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ")) {
            flushParagraph()
            blocks.add(MdBlock.Bullet(trimmed.substring(2).trim()))
            continue
        }
        val numbered = Regex("^(\\d+[.)])\\s+(.+)$").matchEntire(trimmed)
        if (numbered != null) {
            flushParagraph()
            blocks.add(MdBlock.Bullet(numbered.groupValues[2], numbered.groupValues[1]))
            continue
        }
        if (paragraph.isNotEmpty()) paragraph.append(' ')
        paragraph.append(trimmed)
    }
    if (inCode) blocks.add(MdBlock.Code(codeLanguage, code.toString().trimEnd()))
    flushParagraph()
    return blocks
}

private val markdownLink = Regex("""\[([^\]]+)]\((?:<([^>]+)>|([^)]+))\)""")

private fun inline(text: String, codeBackground: Color, codeColor: Color, linkColor: Color): AnnotatedString = buildAnnotatedString {
    var index = 0
    while (index < text.length) {
        if (text[index] == '[') {
            val link = markdownLink.find(text, index)?.takeIf { it.range.first == index }
            if (link != null) {
                val label = link.groupValues[1]
                val target = (link.groups[2]?.value ?: link.groupValues[3]).trim()
                if (target.startsWith("https://", true) || target.startsWith("http://", true)) {
                    withLink(LinkAnnotation.Url(target, TextLinkStyles(style = SpanStyle(color = linkColor)))) { append(label) }
                } else append(label)
                index = link.range.last + 1
                continue
            }
        }
        if (text.startsWith("**", index)) {
            val end = text.indexOf("**", index + 2)
            if (end > index + 2) {
                withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(text.substring(index + 2, end)) }
                index = end + 2
                continue
            }
        }
        if (text[index] == '`') {
            val end = text.indexOf('`', index + 1)
            if (end > index + 1) {
                withStyle(
                    SpanStyle(
                        fontFamily = FontFamily.Monospace,
                        background = codeBackground,
                        color = codeColor,
                    )
                ) { append(text.substring(index + 1, end)) }
                index = end + 1
                continue
            }
        }
        append(text[index])
        index++
    }
}

/**
 * Lightweight DSH-style Markdown: paragraphs, headings, bullets and fenced code
 * blocks (the shapes that actually occur in agent answers), plus inline bold and
 * code. Unknown syntax remains as plain text.
 */
@Composable
fun MarkdownText(text: String, color: Color = MaterialTheme.colorScheme.onBackground) {
    val blocks = remember(text) { parseMarkdown(text) }
    if (blocks.isEmpty()) return
    val codeBackground = MaterialTheme.colorScheme.surfaceVariant
    val codeColor = MaterialTheme.colorScheme.onSurface
    val linkColor = MaterialTheme.colorScheme.secondary
    Column {
        blocks.forEachIndexed { index, block ->
            if (index > 0) Spacer(Modifier.height(8.dp))
            when (block) {
                is MdBlock.Heading -> Text(
                    text = inline(block.text, codeBackground, codeColor, linkColor),
                    fontSize = 16.sp,
                    lineHeight = 23.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = color,
                )
                is MdBlock.Paragraph -> SelectionContainer {
                    Text(
                        text = inline(block.text, codeBackground, codeColor, linkColor),
                        fontSize = 15.sp,
                        lineHeight = 24.sp,
                        color = color,
                    )
                }
                is MdBlock.Bullet -> Row(Modifier.fillMaxWidth()) {
                    Text(block.marker, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 15.sp, modifier = Modifier.padding(top = 1.dp))
                    Spacer(Modifier.width(8.dp))
                    SelectionContainer {
                        Text(
                            inline(block.text, codeBackground, codeColor, linkColor),
                            fontSize = 15.sp,
                            lineHeight = 24.sp,
                            color = color,
                        )
                    }
                }
                is MdBlock.Code -> Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(vertical = 2.dp)
                        .background(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.small)
                ) {
                    if (block.language.isNotBlank()) {
                        Text(
                            block.language,
                            fontSize = 9.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontFamily = FontFamily.Monospace,
                            modifier = Modifier.padding(start = 12.dp, top = 8.dp),
                        )
                    }
                    Text(
                        block.text,
                        fontSize = 11.5.sp,
                        lineHeight = 17.sp,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontFamily = FontFamily.Monospace,
                        modifier = Modifier
                            .horizontalScroll(rememberScrollState())
                            .padding(12.dp),
                    )
                }
            }
        }
    }
}
