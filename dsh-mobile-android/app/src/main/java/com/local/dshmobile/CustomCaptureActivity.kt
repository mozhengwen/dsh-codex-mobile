package com.local.dshmobile

import android.os.Bundle
import android.view.View
import android.view.WindowManager
import com.journeyapps.barcodescanner.CaptureActivity
import com.journeyapps.barcodescanner.DecoratedBarcodeView

/**
 * Full-screen pair-code scanner. The camera stays edge-to-edge; only the
 * rounded scan window is visible through the dim overlay.
 */
class CustomCaptureActivity : CaptureActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    override fun initializeContent(): DecoratedBarcodeView {
        setContentView(R.layout.capture_custom)
        val barcodeView = findViewById<DecoratedBarcodeView>(R.id.zxing_barcode_scanner)
        barcodeView.viewFinder.visibility = View.GONE
        barcodeView.statusView.visibility = View.GONE
        findViewById<View>(R.id.capture_close).setOnClickListener { finish() }
        findViewById<View>(R.id.capture_cancel).setOnClickListener { finish() }
        return barcodeView
    }
}
