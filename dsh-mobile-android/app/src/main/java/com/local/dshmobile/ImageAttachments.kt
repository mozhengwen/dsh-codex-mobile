package com.local.dshmobile

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import androidx.exifinterface.media.ExifInterface
import android.net.Uri
import android.provider.OpenableColumns
import java.io.ByteArrayOutputStream
import java.util.UUID
import kotlin.math.max

data class PendingImage(val id: String, val name: String, val bytes: ByteArray, val preview: Bitmap, val uploaded: AttachmentDto? = null)

fun prepareImage(resolver: ContentResolver, uri: Uri): PendingImage {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, bounds) }
    require(bounds.outWidth > 0 && bounds.outHeight > 0) { "无法读取图片，请选择相册中的图片" }
    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / sample > 2400) sample *= 2
    val decoded = resolver.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
        ?: throw IllegalArgumentException("无法读取图片")
    val orientation = runCatching { resolver.openInputStream(uri).use { ExifInterface(it!!).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) } }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
    val transform = Matrix().apply {
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> postScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> postScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> { postRotate(90f); postScale(-1f, 1f) }
            ExifInterface.ORIENTATION_TRANSVERSE -> { postRotate(270f); postScale(-1f, 1f) }
        }
    }
    var bitmap = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, transform, true)
    if (bitmap !== decoded) decoded.recycle()
    val scale = 1600f / max(bitmap.width, bitmap.height)
    if (scale < 1f) {
        val small = Bitmap.createScaledBitmap(bitmap, max(1, (bitmap.width * scale).toInt()), max(1, (bitmap.height * scale).toInt()), true)
        if (small !== bitmap) bitmap.recycle()
        bitmap = small
    }
    val opaque = Bitmap.createBitmap(bitmap.width, bitmap.height, Bitmap.Config.RGB_565)
    Canvas(opaque).apply { drawColor(Color.WHITE); drawBitmap(bitmap, 0f, 0f, null) }
    bitmap.recycle()
    val output = ByteArrayOutputStream()
    for (quality in listOf(88, 75, 60, 45)) {
        output.reset(); opaque.compress(Bitmap.CompressFormat.JPEG, quality, output)
        if (output.size() <= 2 * 1024 * 1024) break
    }
    val factor = 180f / max(opaque.width, opaque.height)
    val preview = Bitmap.createScaledBitmap(opaque, max(1, (opaque.width * factor).toInt()), max(1, (opaque.height * factor).toInt()), true)
    if (preview !== opaque) opaque.recycle()
    require(output.size() <= 2 * 1024 * 1024) { "压缩后图片仍超过 2 MB，请选择较小图片" }
    val displayName = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { if (it.moveToFirst()) it.getString(0) else null } ?: "图片"
    return PendingImage(UUID.randomUUID().toString(), displayName.substringBeforeLast('.', displayName).take(100) + ".jpg", output.toByteArray(), preview)
}
