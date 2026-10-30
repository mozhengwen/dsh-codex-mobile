package com.local.dshmobile

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View
import android.animation.ValueAnimator
import android.content.Context
import android.view.animation.LinearInterpolator
import kotlin.math.min

/**
 * Full-screen dim overlay with a rounded, animated scan window. Replaces
 * ZXing's default rectangular viewfinder so the pairing scanner matches the
 * app instead of looking like a generic barcode app.
 */
class ScannerOverlay @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0,
) : View(context, attrs, defStyleAttr) {
    private val density = resources.displayMetrics.density
    private val dimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(178, 0, 0, 0) }
    private val framePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#7AAAFF")
        style = Paint.Style.STROKE
        strokeWidth = 1.8f * density
    }
    private val cornerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#C7D7FF")
        style = Paint.Style.STROKE
        strokeWidth = 3.4f * density
        strokeCap = Paint.Cap.ROUND
    }
    private val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#7AAAFF")
        strokeWidth = 1.4f * density
        strokeCap = Paint.Cap.ROUND
    }
    private var progress = 0f
    private var animator: ValueAnimator? = null

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        animator?.cancel()
        animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 2400
            repeatCount = ValueAnimator.INFINITE
            interpolator = LinearInterpolator()
            addUpdateListener {
                progress = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    override fun onDetachedFromWindow() {
        animator?.cancel()
        animator = null
        super.onDetachedFromWindow()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val radius = 26f * density
        val side = min(width * 0.70f, height * 0.34f)
        val left = (width - side) / 2f
        val top = height * 0.33f - side / 2f
        val rect = RectF(left, top, left + side, top + side)

        val cutout = Path().apply {
            fillType = Path.FillType.EVEN_ODD
            addRect(0f, 0f, width.toFloat(), height.toFloat(), Path.Direction.CW)
            addRoundRect(rect, radius, radius, Path.Direction.CW)
        }
        canvas.drawPath(cutout, dimPaint)
        canvas.drawRoundRect(rect, radius, radius, framePaint)

        val arm = 24f * density
        val r = radius
        // Four corner brackets.
        canvas.drawLine(rect.left + r, rect.top, rect.left + r + arm, rect.top, cornerPaint)
        canvas.drawLine(rect.left, rect.top + r, rect.left, rect.top + r + arm, cornerPaint)
        canvas.drawLine(rect.right - r, rect.top, rect.right - r - arm, rect.top, cornerPaint)
        canvas.drawLine(rect.right, rect.top + r, rect.right, rect.top + r + arm, cornerPaint)
        canvas.drawLine(rect.left + r, rect.bottom, rect.left + r + arm, rect.bottom, cornerPaint)
        canvas.drawLine(rect.left, rect.bottom - r, rect.left, rect.bottom - r - arm, cornerPaint)
        canvas.drawLine(rect.right - r, rect.bottom, rect.right - r - arm, rect.bottom, cornerPaint)
        canvas.drawLine(rect.right, rect.bottom - r, rect.right, rect.bottom - r - arm, cornerPaint)

        val lineY = rect.top + 16f * density + (rect.height() - 32f * density) * progress
        canvas.drawLine(rect.left + 18f * density, lineY, rect.right - 18f * density, lineY, linePaint)
    }
}
