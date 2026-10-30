package com.local.dshmobile

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.FormBody
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class UnauthorizedException : Exception("pairing expired")

data class PairResult(val ok: Boolean, val cookie: String? = null, val message: String = "")

/**
 * Thin native client for the DSH Mobile BFF. The phone never talks to DSH's
 * internal protocol: this client only knows the small JSON/WebSocket contract
 * exposed by the plugin on the computer.
 */
class MobileApi(private val baseUrl: String, private val cookie: String) {
    private val closed = AtomicBoolean(false)
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .build()

    fun ping(): Boolean {
        return try {
            get("/mobile/api/ping")
            true
        } catch (_: Exception) {
            false
        }
    }

    fun sessions(): List<SessionDto> {
        val value = get("/mobile/api/sessions")
        return json.decodeFromString<SessionsResponse>(value.toString()).sessions
    }

    fun workspaces(): WorkspacesResponse =
        json.decodeFromString<WorkspacesResponse>(get("/mobile/api/workspaces").toString())

    fun createSession(workspaceId: String?, cwd: String?): SessionDto {
        val value = post("/mobile/api/sessions", buildJsonObject {
            if (!workspaceId.isNullOrBlank()) put("workspaceId", workspaceId)
            else if (!cwd.isNullOrBlank()) put("cwd", cwd)
        })
        return SessionDto(
            id = value["sessionId"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            title = value["title"]?.jsonPrimitive?.contentOrNull ?: "新会话",
            cwd = value["cwd"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            projectId = value["projectId"]?.jsonPrimitive?.contentOrNull,
            hostId = value["hostId"]?.jsonPrimitive?.contentOrNull ?: "local",
        )
    }

    fun prompt(sessionId: String, text: String, attachments: List<String> = emptyList()) {
        post("/mobile/api/sessions/${encode(sessionId)}/prompt", buildJsonObject {
            put("text", text)
            put("requestId", java.util.UUID.randomUUID().toString())
            put("attachmentIds", JsonArray(attachments.map { JsonPrimitive(it) }))
        })
    }

    fun upload(image: PendingImage): AttachmentDto {
        val result = post("/mobile/api/uploads", buildJsonObject {
            put("name", image.name); put("mimeType", "image/jpeg")
            put("data", android.util.Base64.encodeToString(image.bytes, android.util.Base64.NO_WRAP))
        })
        return json.decodeFromString<AttachmentDto>(result.getValue("attachment").toString())
    }

    fun image(path: String): ByteArray {
        require(path.startsWith("/mobile/api/uploads/") || Regex("^/mobile/api/sessions/[^/]+/images/[^/]+$").matches(path))
        val request = Request.Builder().url(baseUrl + path).header("Cookie", cookie).get().build()
        client.newCall(request).execute().use { response ->
            if (response.code == 401) throw UnauthorizedException()
            check(response.isSuccessful) { "图片加载失败" }
            val bytes = response.body?.bytes() ?: error("图片为空")
            check(bytes.size <= 8 * 1024 * 1024) { "图片过大" }
            return bytes
        }
    }

    fun cancel(sessionId: String) {
        post("/mobile/api/sessions/${encode(sessionId)}/cancel", buildJsonObject { })
    }
    fun modelSettings(sessionId: String): ModelSettings = json.decodeFromString<ModelSettings>(get("/mobile/api/sessions/${encode(sessionId)}/model").toString())
    fun selectModel(sessionId: String, selection: ModelSelection): ModelSelection = json.decodeFromString<ModelSelection>(post("/mobile/api/sessions/${encode(sessionId)}/model", buildJsonObject {
        put("provider", selection.provider); put("model", selection.model)
        selection.reasoningEffort?.let { put("reasoningEffort", it) }
    }).getValue("selected").toString())

    fun rename(sessionId: String, title: String) {
        post("/mobile/api/sessions/${encode(sessionId)}/rename", buildJsonObject {
            put("title", title)
        })
    }

    fun answerApproval(id: String, allowed: Boolean) {
        post("/mobile/api/interactions/${encode(id)}", buildJsonObject {
            put("outcome", if (allowed) "allowed-once" else "rejected")
        })
    }

    fun answerQuestions(id: String, answers: List<QuestionAnswer>) {
        val encoded = json.encodeToString(answers)
        val body = buildJsonObject {
            put("answers", json.parseToJsonElement(encoded))
        }
        post("/mobile/api/interactions/${encode(id)}", body)
    }

    fun openSocket(listener: WebSocketListener): WebSocket {
        val request = Request.Builder()
            .url("$baseUrl/mobile/ws")
            .header("Cookie", cookie)
            .build()
        return client.newWebSocket(request, listener)
    }

    fun close() {
        if (!closed.compareAndSet(false, true)) return
        // TLS shutdown can write close_notify to the socket, even for idle pooled
        // connections. Run all cleanup off the UI thread, including onCleared.
        cleanupExecutor.execute {
            try {
                client.dispatcher.cancelAll()
                client.connectionPool.evictAll()
            } finally {
                client.dispatcher.executorService.shutdown()
            }
        }
    }

    private fun get(path: String): JsonObject {
        val request = Request.Builder()
            .url(baseUrl + path)
            .header("Cookie", cookie)
            .header("Accept", "application/json")
            .get()
            .build()
        return execute(request)
    }

    private fun post(path: String, body: JsonObject): JsonObject {
        val request = Request.Builder()
            .url(baseUrl + path)
            .header("Cookie", cookie)
            .header("Accept", "application/json")
            .post(body.toString().toRequestBody(JSON_TYPE))
            .build()
        return execute(request)
    }

    private fun execute(request: Request): JsonObject {
        client.newCall(request).execute().use { response ->
            if (response.code == 401) throw UnauthorizedException()
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val error = runCatching {
                    json.decodeFromString<ErrorResponse>(text).error
                }.getOrNull()
                throw IllegalStateException(error ?: "HTTP ${response.code}")
            }
            return runCatching { json.parseToJsonElement(text).jsonObject }
                .getOrElse { throw IllegalStateException("invalid server response") }
        }
    }

    private fun encode(value: String): String = java.net.URLEncoder.encode(value, "UTF-8")

    companion object {
        private val cleanupExecutor = Executors.newSingleThreadExecutor { work -> Thread(work, "dsh-http-cleanup").apply { isDaemon = true } }
        private val JSON_TYPE = "application/json; charset=utf-8".toMediaType()
        private val ERROR_BLOCK = Regex("<p class=\"error\">(.*?)</p>", RegexOption.DOT_MATCHES_ALL)

        fun normalizeBase(raw: String): String? {
            var input = raw.trim()
            if (input.isEmpty()) return null
            if (!input.matches(Regex("^[a-zA-Z][a-zA-Z0-9+.-]*://.*$"))) input = "http://$input"
            val url = input.toHttpUrlOrNull() ?: return null
            if (url.scheme != "http" && url.scheme != "https") return null
            return url.newBuilder()
                .encodedPath(if (url.encodedPath == "/backends/codex" || url.encodedPath.startsWith("/backends/codex/")) "/backends/codex" else "/")
                .query(null)
                .fragment(null)
                .build()
                .toString()
                .trimEnd('/')
        }

        fun pair(base: String, token: String?, code: String?, deviceName: String, clientId: String = "", previousCookie: String = ""): PairResult {
            val client = OkHttpClient.Builder()
                .connectTimeout(12, TimeUnit.SECONDS)
                .readTimeout(20, TimeUnit.SECONDS)
                .followRedirects(false)
                .followSslRedirects(false)
                .build()
            return try {
                val form = FormBody.Builder()
                    .add("name", deviceName)
                    .add("clientId", clientId)
                    .apply {
                        if (!token.isNullOrBlank()) add("token", token)
                        else add("code", code.orEmpty())
                    }
                    .build()
                val request = Request.Builder()
                    .url("$base/pair")
                    .header("Accept", "text/html,application/json")
                    .apply { if (previousCookie.isNotBlank()) header("Cookie", previousCookie) }
                    .post(form)
                    .build()
                client.newCall(request).execute().use { response ->
                    val setCookies = response.headers("Set-Cookie")
                    val cookie = setCookies.firstOrNull { it.startsWith("dsh_mobile_session=") }
                        ?.substringBefore(';')
                    if (response.code in 300..399 && cookie != null) {
                        return PairResult(true, cookie, "")
                    }
                    val body = response.body?.string().orEmpty()
                    val message = ERROR_BLOCK.find(body)?.groupValues?.getOrNull(1)
                        ?.replace(Regex("<[^>]+>"), "")
                        ?.trim()
                        ?.ifBlank { null }
                        ?: "HTTP ${response.code}"
                    PairResult(false, null, message)
                }
            } catch (error: Exception) {
                PairResult(false, null, error.message ?: "network error")
            } finally {
                client.dispatcher.executorService.shutdown()
            }
        }
    }
}
