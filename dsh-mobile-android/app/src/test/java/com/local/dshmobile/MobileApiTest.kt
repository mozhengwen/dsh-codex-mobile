package com.local.dshmobile

import org.junit.Assert.*
import org.junit.Test

class MobileApiTest {
    @Test fun preservesCodexRouteWhenScanningPairingUrl() {
        assertEquals("https://example.test/backends/codex", MobileApi.normalizeBase("https://example.test/backends/codex/pair?token=secret#x"))
        assertEquals("https://example.test", MobileApi.normalizeBase("https://example.test/pair?token=secret"))
        assertEquals("http://192.168.1.2:47822", MobileApi.normalizeBase("192.168.1.2:47822"))
        assertNull(MobileApi.normalizeBase("file:///example"))
    }
}
