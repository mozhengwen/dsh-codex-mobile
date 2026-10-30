package com.local.dshmobile

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.max

@Composable
internal fun PendingImagesRow(images: List<PendingImage>, enabled: Boolean, onRemove: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        images.forEach { image ->
            Box(Modifier.size(80.dp)) {
                Image(image.preview.asImageBitmap(), image.name, Modifier.fillMaxSize().clip(RoundedCornerShape(9.dp)), contentScale = ContentScale.Fit)
                Surface(Modifier.align(Alignment.TopEnd), shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surface.copy(alpha = .95f)) {
                    IconButton(onClick = { onRemove(image.id) }, enabled = enabled, modifier = Modifier.size(26.dp)) { Icon(Icons.Filled.Close, "移除 ${image.name}", Modifier.size(16.dp)) }
                }
            }
        }
    }
}

private fun decodeImage(bytes: ByteArray, maxSize: Int): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / sample > maxSize) sample *= 2
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
}

@Composable
private fun Photo(attachment: AttachmentDto, viewModel: AppViewModel, fullSize: Boolean, modifier: Modifier) {
    var bitmap by remember(attachment.id, fullSize) { mutableStateOf<Bitmap?>(null) }
    var failed by remember(attachment.id, fullSize) { mutableStateOf(false) }
    var retry by remember { mutableIntStateOf(0) }
    var zoom by remember(attachment.id) { mutableFloatStateOf(1f) }
    var pan by remember(attachment.id) { mutableStateOf(Offset.Zero) }
    LaunchedEffect(attachment.id, attachment.url, fullSize, retry) {
        failed = false
        bitmap = withContext(Dispatchers.IO) { runCatching { decodeImage(viewModel.image(attachment.url), if (fullSize) 2048 else 320) }.getOrNull() }
        failed = bitmap == null
    }
    Box(modifier, contentAlignment = Alignment.Center) {
        val image = bitmap
        if (image != null) Image(image.asImageBitmap(), attachment.name,
            Modifier.fillMaxSize().then(if (fullSize) Modifier
                .pointerInput(attachment.id) { detectTapGestures(onDoubleTap = { zoom = if (zoom > 1f) 1f else 2.5f; pan = Offset.Zero }) }
                .pointerInput(attachment.id) { detectTransformGestures { _, delta, scale, _ ->
                    zoom = (zoom * scale).coerceIn(1f, 5f)
                    pan = if (zoom == 1f) Offset.Zero else Offset((pan.x + delta.x).coerceIn(-size.width * (zoom - 1) / 2, size.width * (zoom - 1) / 2), (pan.y + delta.y).coerceIn(-size.height * (zoom - 1) / 2, size.height * (zoom - 1) / 2))
                } }
                .graphicsLayer { scaleX = zoom; scaleY = zoom; translationX = pan.x; translationY = pan.y } else Modifier), contentScale = ContentScale.Fit)
        else if (failed) TextButton(onClick = { retry++ }) { Text("重试图片", fontSize = 10.sp) }
        else Text("图片加载中…", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
internal fun MessageImages(images: List<AttachmentDto>, viewModel: AppViewModel) {
    var selected by remember { mutableStateOf<AttachmentDto?>(null) }
    Row(Modifier.horizontalScroll(rememberScrollState()).padding(8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        images.forEach { attachment ->
            Surface(shape = RoundedCornerShape(10.dp)) {
                Photo(attachment, viewModel, false, Modifier.size(if (images.size == 1) 220.dp else 156.dp, if (images.size == 1) 145.dp else 115.dp).clickable { selected = attachment })
            }
        }
    }
    selected?.let { image ->
        Dialog(onDismissRequest = { selected = null }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                Box(Modifier.fillMaxSize()) {
                    Photo(image, viewModel, true, Modifier.fillMaxSize().padding(horizontal = 12.dp, vertical = 60.dp))
                    Text(image.name, Modifier.align(Alignment.TopStart).padding(start = 20.dp, top = 26.dp, end = 70.dp), maxLines = 1, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("双指缩放 · 双击放大或还原", Modifier.align(Alignment.BottomCenter).padding(24.dp), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    IconButton(onClick = { selected = null }, modifier = Modifier.align(Alignment.TopEnd).padding(12.dp)) { Icon(Icons.Filled.Close, "关闭图片") }
                }
            }
        }
    }
}
