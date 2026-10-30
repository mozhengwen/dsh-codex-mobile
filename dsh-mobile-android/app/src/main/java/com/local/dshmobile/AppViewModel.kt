package com.local.dshmobile

import android.app.Application
import android.os.Build
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.SystemClock
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

enum class Screen { Setup, Sessions, Chat }

data class UiState(
    val screen: Screen = Screen.Setup,
    val baseUrl: String = "",
    val connections: List<String> = emptyList(),
    val pairing: Boolean = false,
    val loadingSessions: Boolean = false,
    val sessionsError: String? = null,
    val loadingHistory: Boolean = false,
    val snapshotError: String? = null,
    val historyNotice: String? = null,
    val composer: String = "",
    val modelSettings: ModelSettings? = null,
    val loadingModels: Boolean = false,
    val modelError: String? = null,
    val savingModel: Boolean = false,
    val creatingSession: Boolean = false,
    val selectingWorkspace: Boolean = false,
    val loadingWorkspaces: Boolean = false,
    val workspaces: List<WorkspaceDto> = emptyList(),
    val workspaceError: String? = null,
    val defaultDirectory: String = "",
    val sending: Boolean = false,
    val addingImages: Boolean = false,
    val pendingImages: List<PendingImage> = emptyList(),
    val sessions: List<SessionDto> = emptyList(),
    val current: SessionDto? = null,
    val title: String = "",
    val cwd: String = "",
    val items: List<ChatItem> = emptyList(),
    val live: LiveText? = null,
    val running: Boolean = false,
    val connected: Boolean = false,
    val reconnecting: Boolean = false,
    val interaction: Interaction? = null,
    val error: String? = null,
    val notice: String? = null,
) {
    val isCodex: Boolean get() = baseUrl.endsWith("/backends/codex")
    val backendName: String get() = if (isCodex) "Codex" else "DSH"
}

class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val prefs = application.getSharedPreferences("dsh-mobile", 0)
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
    }

    private val _state = MutableStateFlow(UiState(baseUrl = prefs.getString(KEY_BASE, "").orEmpty(), connections = savedConnections()))
    val state: StateFlow<UiState> = _state.asStateFlow()

    private var api: MobileApi? = null
    private data class Draft(val text: String, val images: List<PendingImage>)
    private val drafts = mutableMapOf<String, Draft>()
    private fun draftKey(base: String, id: String) = "$base|$id"
    private fun saveDraft() {
        val current = _state.value
        if (current.screen != Screen.Chat || current.current == null) return
        val key = draftKey(current.baseUrl, current.current.id)
        if (current.composer.isBlank() && current.pendingImages.isEmpty()) drafts.remove(key)
        else drafts[key] = Draft(current.composer, current.pendingImages)
    }
    fun updateComposer(text: String) { _state.update { it.copy(composer = text) } }
    private fun navigationReady(): Boolean {
        if (!_state.value.sending && !_state.value.addingImages) return true
        _state.update { it.copy(notice = if (it.sending) "正在发送，请稍候" else "正在准备图片，请稍候") }
        return false
    }
    private var socket: WebSocket? = null
    private var reconnectJob: Job? = null
    private var intentionalClose = false
    private var socketGeneration = 0L
    private var heartbeatJob: Job? = null
    private val frameQueue = ArrayDeque<ServerFrame>()
    private var frameFlushJob: Job? = null
    private var recoveringAppend = false
    private var lastFrameAt = 0L
    private var reconnectAttempt = 0
    private var foreground = true
    private val imageCache = object : android.util.LruCache<String, ByteArray>(16 * 1024 * 1024) {
        override fun sizeOf(key: String, value: ByteArray): Int = value.size
    }
    private val connectivity = application.getSystemService(ConnectivityManager::class.java)
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
            if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
                viewModelScope.launch {
                    if (foreground && api != null && !_state.value.connected) reconnect()
                }
            }
        }
    }

    init {
        connectivity.registerDefaultNetworkCallback(networkCallback)
        val base = prefs.getString(KEY_BASE, "").orEmpty()
        val cookie = prefs.getString(KEY_COOKIE, "").orEmpty()
        if (base.isNotEmpty() && cookie.isNotEmpty()) {
            prefs.edit().putString("cookie:$base", cookie).apply()
            api = MobileApi(base, cookie)
            _state.update { it.copy(screen = Screen.Sessions, baseUrl = base) }
            refreshSessions()
        }
    }

    fun pair(rawBase: String, code: String?, token: String? = null) {
        if (_state.value.pairing) return
        val base = MobileApi.normalizeBase(rawBase)
        if (base == null) {
            _state.update { it.copy(error = "请输入有效的电脑地址") }
            return
        }
        if (token.isNullOrBlank() && (code == null || !code.matches(Regex("\\d{6}")))) {
            _state.update { it.copy(error = "请输入 6 位配对码") }
            return
        }
        _state.update { it.copy(pairing = true, error = null, baseUrl = base) }
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                val clientId = prefs.getString("installation-id", null) ?: java.util.UUID.randomUUID().toString().also { prefs.edit().putString("installation-id", it).apply() }
                MobileApi.pair(base, token, code, deviceName(), clientId, prefs.getString("cookie:$base", "").orEmpty())
            }
            if (!result.ok || result.cookie == null) {
                _state.update { it.copy(pairing = false, error = result.message.ifBlank { "配对失败" }) }
                return@launch
            }
            val connections = (savedConnections() + base).toSet()
            prefs.edit().putString(KEY_BASE, base).putString(KEY_COOKIE, result.cookie)
                .putString("cookie:$base", result.cookie).putStringSet("connections", connections).apply()
            api?.close()
            api = MobileApi(base, result.cookie)
            _state.update {
                it.copy(
                    pairing = false,
                    screen = Screen.Sessions,
                    baseUrl = base,
                    connections = connections.toList(),
                    error = null,
                    notice = "配对成功",
                )
            }
            refreshSessions()
        }
    }

    /** Handles a scanned QR: a pairing URL pairs directly; a bare code needs the URL field. */
    fun handleScanned(contents: String): Boolean {
        val text = contents.trim()
        if (text.matches(Regex("\\d{6}"))) return false
        val uri = android.net.Uri.parse(text)
        val path = uri.path.orEmpty()
        if (path.endsWith(".apk", ignoreCase = true)) {
            _state.update { it.copy(error = "这是 App 安装包二维码，请扫描电脑面板里的配对二维码") }
            return true
        }
        val base = MobileApi.normalizeBase(text)
        if (base == null) {
            _state.update { it.copy(error = "这不是配对二维码，请扫描电脑面板里的配对二维码") }
            return true
        }
        val token = uri.getQueryParameter("token") ?: queryParam(text, "token")
        if (!token.isNullOrBlank()) {
            pair(base, null, token)
            return true
        }
        val code = uri.getQueryParameter("code") ?: queryParam(text, "code")
        if (code != null && code.matches(Regex("\\d{6}"))) {
            pair(base, code, null)
            return true
        }
        _state.update { it.copy(baseUrl = base, error = "二维码里没有配对令牌，请在电脑端刷新二维码后重扫") }
        return true
    }

    private fun queryParam(raw: String, name: String): String? {
        val match = Regex("[?&#]" + Regex.escape(name) + "=([^&#]+)").find(raw) ?: return null
        return runCatching {
            java.net.URLDecoder.decode(match.groupValues[1], Charsets.UTF_8.name())
        }.getOrNull()
    }

    fun refreshSessions() {
        val client = api ?: return
        if (_state.value.loadingSessions) return
        _state.update { it.copy(loadingSessions = true, sessionsError = null) }
        viewModelScope.launch {
            try {
                val sessions = withContext(Dispatchers.IO) { client.sessions() }
                if (api !== client) return@launch
                _state.update { it.copy(sessions = sessions, loadingSessions = false) }
                runCatching { withContext(Dispatchers.IO) { client.workspaces() } }.getOrNull()?.let { workspaces ->
                    if (api === client) _state.update { it.copy(workspaces = workspaces.workspaces) }
                }
            } catch (error: Throwable) {
                if (api !== client) return@launch
                if (error is CancellationException) throw error
                if (error is UnauthorizedException) onFailure(error)
                else _state.update { it.copy(loadingSessions = false, sessionsError = "暂时无法加载任务，请检查电脑端连接后重试。") }
            }
        }
    }

    fun chooseWorkspace() {
        val client = api ?: return
        _state.update { it.copy(selectingWorkspace = true, loadingWorkspaces = true, workspaceError = null) }
        viewModelScope.launch {
            try {
                val result = withContext(Dispatchers.IO) { client.workspaces() }
                if (api !== client) return@launch
                _state.update { it.copy(workspaces = result.workspaces, defaultDirectory = result.defaultDirectory, loadingWorkspaces = false) }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                if (api !== client) return@launch
                if (error is UnauthorizedException) onFailure(error)
                else _state.update { it.copy(loadingWorkspaces = false, workspaceError = "无法加载电脑工作区：${error.message}。请确认电脑端手机远控插件已更新。") }
            }
        }
    }

    fun dismissWorkspacePicker() {
        if (!_state.value.creatingSession) _state.update { it.copy(selectingWorkspace = false) }
    }

    fun createSession(workspaceId: String? = null, cwd: String? = null) {
        val client = api ?: return
        if (_state.value.creatingSession) return
        _state.update { it.copy(creatingSession = true, error = null) }
        viewModelScope.launch {
            try {
                val session = withContext(Dispatchers.IO) { client.createSession(workspaceId, cwd) }
                if (api !== client) return@launch
                _state.update { it.copy(creatingSession = false, selectingWorkspace = false) }
                prefs.edit().putString("last-workspace:${_state.value.baseUrl}", workspaceId.orEmpty()).apply()
                openSession(session.copy(blank = true, title = "新会话"))
            } catch (error: Throwable) {
                if (api !== client) return@launch
                onFailure(error)
                _state.update { it.copy(creatingSession = false) }
            }
        }
    }

    fun openSession(session: SessionDto) {
        saveDraft()
        val draft = drafts[draftKey(_state.value.baseUrl, session.id)]
        intentionalClose = false
        closeSocket()
        _state.update {
            it.copy(
                screen = Screen.Chat,
                current = session,
                sending = false,
                pendingImages = draft?.images.orEmpty(),
                composer = draft?.text.orEmpty(),
                loadingHistory = true,
                snapshotError = null,
                historyNotice = null,
                modelSettings = null,
                loadingModels = false,
                modelError = null,
                addingImages = false,
                title = session.title,
                cwd = session.cwd,
                items = emptyList(),
                live = null,
                running = session.running,
                connected = false,
                interaction = null,
                error = null,
            )
        }
        connectSocket(session.id)
        loadModels()
    }
    fun loadModels() {
        val client = api ?: return
        val session = _state.value.current ?: return
        _state.update { it.copy(loadingModels = true, modelError = null) }
        viewModelScope.launch {
            try {
                val value = withContext(Dispatchers.IO) { client.modelSettings(session.id) }
                if (api === client && _state.value.current?.id == session.id) _state.update { it.copy(modelSettings = value, loadingModels = false) }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                if (api === client && _state.value.current?.id == session.id) _state.update { it.copy(loadingModels = false, modelError = "无法读取模型设置，请确认电脑端插件已更新。") }
            }
        }
    }
    fun selectModel(selection: ModelSelection) {
        val client = api ?: return
        val session = _state.value.current ?: return
        _state.update { it.copy(savingModel = true, modelError = null) }
        viewModelScope.launch {
            try {
                val selected = withContext(Dispatchers.IO) { client.selectModel(session.id, selection) }
                if (api === client && _state.value.current?.id == session.id) _state.update { it.copy(savingModel = false, modelSettings = it.modelSettings?.copy(selected = selected), notice = "模型设置已更新，下一条消息生效") }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                if (api === client && _state.value.current?.id == session.id) _state.update { it.copy(savingModel = false, modelError = error.message ?: "模型设置失败") }
            }
        }
    }

    fun closeChat() {
        if (!navigationReady()) return
        saveDraft()
        intentionalClose = true
        closeSocket()
        _state.update { it.copy(screen = Screen.Sessions, current = null, items = emptyList(), live = null, interaction = null) }
        refreshSessions()
    }

    fun send(text: String, onSent: () -> Unit = {}) {
        val client = api ?: return
        val session = _state.value.current ?: return
        val trimmed = text.trim()
        val images = _state.value.pendingImages
        if ((trimmed.isEmpty() && images.isEmpty()) || _state.value.sending || _state.value.addingImages) return
        _state.update { it.copy(sending = true, error = null) }
        viewModelScope.launch {
            try {
                val attachments = images.map { image ->
                    val uploaded = image.uploaded ?: withContext(Dispatchers.IO) { client.upload(image) }
                    if (api !== client || _state.value.current?.id != session.id) return@launch
                    _state.update { state -> state.copy(pendingImages = state.pendingImages.map { if (it.id == image.id) it.copy(uploaded = uploaded) else it }) }
                    uploaded.id
                }
                withContext(Dispatchers.IO) { client.prompt(session.id, trimmed, attachments) }
                if (api !== client || _state.value.current?.id != session.id) return@launch
                drafts.remove(draftKey(_state.value.baseUrl, session.id))
                _state.update { it.copy(sending = false, pendingImages = emptyList(), composer = "") }
                onSent()
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                if (api !== client || _state.value.current?.id != session.id) return@launch
                onFailure(error)
                _state.update { it.copy(sending = false) }
            }
        }
    }

    fun addImages(uris: List<android.net.Uri>) {
        val client = api ?: return
        val session = _state.value.current ?: return
        if (_state.value.sending || _state.value.addingImages || uris.isEmpty()) return
        val remaining = 4 - _state.value.pendingImages.size
        if (remaining <= 0) { _state.update { it.copy(error = "每条消息最多选择 4 张图片") }; return }
        _state.update { it.copy(addingImages = true) }
        viewModelScope.launch {
            try {
                for (uri in uris.take(remaining)) {
                    val image = withContext(Dispatchers.IO) { prepareImage(getApplication<Application>().contentResolver, uri) }
                    if (api !== client || _state.value.current?.id != session.id) return@launch
                    val otherBytes = drafts.filterKeys { it != draftKey(_state.value.baseUrl, session.id) }.values.sumOf { draft -> draft.images.sumOf { it.bytes.size } }
                    check(otherBytes + _state.value.pendingImages.sumOf { it.bytes.size } + image.bytes.size <= 32 * 1024 * 1024) { "待发图片较多，请先发送其他任务中的图片" }
                    _state.update { it.copy(pendingImages = it.pendingImages + image) }
                }
                if (uris.size > remaining) _state.update { it.copy(notice = "每条消息最多选择 4 张图片") }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                if (api === client && _state.value.current?.id == session.id) _state.update { it.copy(error = error.message ?: "无法读取图片") }
            } finally {
                if (api === client && _state.value.current?.id == session.id) _state.update { it.copy(addingImages = false) }
            }
        }
    }

    fun removeImage(id: String) {
        if (!_state.value.sending) _state.update { it.copy(pendingImages = it.pendingImages.filterNot { image -> image.id == id }) }
    }

    suspend fun image(path: String): ByteArray {
        val client = api ?: error("请先连接电脑")
        val key = _state.value.baseUrl + path
        imageCache.get(key)?.let { return it }
        return withContext(Dispatchers.IO) { client.image(path) }.also { imageCache.put(key, it) }
    }

    fun cancelTurn() {
        val client = api ?: return
        val session = _state.value.current ?: return
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { client.cancel(session.id) }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                if (api !== client || _state.value.current?.id != session.id) return@launch
                onFailure(error)
            }
        }
    }

    fun renameCurrent(title: String) {
        val client = api ?: return
        val session = _state.value.current ?: return
        val clean = title.trim().take(200)
        if (clean.isEmpty()) return
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { client.rename(session.id, clean) }
                if (api !== client || _state.value.current?.id != session.id) return@launch
                _state.update { it.copy(title = clean, current = session.copy(title = clean), notice = "任务名称已更新") }
            } catch (error: Throwable) { if (api === client) onFailure(error) }
        }
    }

    fun answerApproval(allowed: Boolean) {
        val client = api ?: return
        val interaction = _state.value.interaction ?: return
        if (interaction.kind != "approval") return
        _state.update { it.copy(interaction = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { client.answerApproval(interaction.id, allowed) }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                if (api !== client) return@launch
                onFailure(error)
            }
        }
    }

    fun answerQuestions(answers: List<QuestionAnswer>) {
        val client = api ?: return
        val interaction = _state.value.interaction ?: return
        if (interaction.kind != "question") return
        _state.update { it.copy(interaction = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { client.answerQuestions(interaction.id, answers) }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                if (api !== client) return@launch
                onFailure(error)
            }
        }
    }

    fun reconnect() {
        if (!foreground) return
        val session = _state.value.current
        if (session != null && _state.value.screen == Screen.Chat) connectSocket(session.id)
        else refreshSessions()
    }

    fun onForeground() {
        foreground = true
        if (api == null) return
        // Re-establish the complete relay and restore a fresh snapshot after sleep.
        reconnectAttempt = 0
        reconnect()
    }

    fun onBackground() {
        foreground = false
        closeSocket()
        _state.update { it.copy(connected = false, reconnecting = false) }
    }

    fun logout(message: String? = null) {
        saveDraft()
        intentionalClose = true
        closeSocket()
        api?.close()
        api = null
        val base = _state.value.baseUrl
        val connections = savedConnections().filterNot { it == base }
        prefs.edit().remove(KEY_COOKIE).remove("cookie:$base").putStringSet("connections", connections.toSet()).apply()
        _state.update {
            UiState(
                screen = Screen.Setup,
                baseUrl = it.baseUrl,
                connections = connections,
                error = message,
            )
        }
    }

    private fun savedConnections(): List<String> {
        val stored = prefs.getStringSet("connections", emptySet()).orEmpty().toMutableSet()
        val base = prefs.getString(KEY_BASE, "").orEmpty()
        val cookie = prefs.getString(KEY_COOKIE, "").orEmpty()
        if (base.isNotBlank() && cookie.isNotBlank()) stored.add(base)
        return stored.toList()
    }

    fun addConnection(base: String? = null) {
        if (!navigationReady()) return
        saveDraft()
        intentionalClose = true
        closeSocket()
        api?.close(); api = null
        _state.value = UiState(baseUrl = base ?: _state.value.baseUrl, connections = savedConnections())
    }

    fun selectConnection(base: String) {
        if (!navigationReady()) return
        saveDraft()
        val cookie = prefs.getString("cookie:$base", null)
            ?: if (prefs.getString(KEY_BASE, "") == base) prefs.getString(KEY_COOKIE, "") else ""
        if (cookie.isNullOrBlank()) { addConnection(); return }
        intentionalClose = true
        closeSocket()
        api?.close()
        api = MobileApi(base, cookie)
        prefs.edit().putString(KEY_BASE, base).putString(KEY_COOKIE, cookie).apply()
        _state.value = UiState(screen = Screen.Sessions, baseUrl = base, connections = savedConnections())
        refreshSessions()
    }

    fun clearError() {
        _state.update { it.copy(error = null) }
    }

    fun clearNotice() {
        _state.update { it.copy(notice = null) }
    }

    private fun connectSocket(sessionId: String) {
        val client = api ?: return
        if (!foreground) return
        closeSocket()
        intentionalClose = false
        val generation = socketGeneration
        _state.update { it.copy(connected = false, reconnecting = true, snapshotError = null) }
        lastFrameAt = SystemClock.elapsedRealtime()
        val connectionStartedAt = lastFrameAt
        fun dispatch(action: () -> Unit) {
            viewModelScope.launch {
                if (generation == socketGeneration && !intentionalClose) action()
            }
        }
        fun lost() {
            heartbeatJob?.cancel()
            heartbeatJob = null
            _state.update { it.copy(connected = false, reconnecting = true) }
            scheduleReconnect(sessionId)
        }
        socket = client.openSocket(object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                dispatch {
                    val subscribe = buildJsonObject {
                        put("type", "subscribe")
                        put("sessionId", sessionId)
                        put("supportsTextAppend", true)
                    }
                    webSocket.send(subscribe.toString())
                    heartbeatJob = viewModelScope.launch {
                        while (generation == socketGeneration) {
                            delay(15_000)
                            val now = SystemClock.elapsedRealtime()
                            if (now - lastFrameAt > 45_000 || (!_state.value.connected && now - connectionStartedAt > 45_000)) {
                                webSocket.cancel()
                                lost()
                                break
                            }
                            webSocket.send("{\"type\":\"ping\"}")
                        }
                    }
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                // OkHttp invokes this off the UI thread, including large history snapshots.
                val frame = runCatching { json.decodeFromString<ServerFrame>(text) }.getOrNull() ?: return
                dispatch {
                    lastFrameAt = SystemClock.elapsedRealtime()
                    enqueueFrame(frame)
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                dispatch {
                    if (response?.code == 401) logout("配对已失效，请重新配对") else lost()
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                dispatch {
                    if (code == 4401) logout("配对已失效，请重新配对") else lost()
                }
            }
        })
    }

    private fun scheduleReconnect(sessionId: String) {
        if (intentionalClose || !foreground || reconnectJob?.isActive == true) return
        val retryDelay = (1000L shl reconnectAttempt.coerceAtMost(4)).coerceAtMost(15_000L)
        reconnectAttempt++
        reconnectJob = viewModelScope.launch {
            delay(retryDelay + kotlin.random.Random.nextLong(300))
            if (!intentionalClose && _state.value.screen == Screen.Chat && _state.value.current?.id == sessionId) {
                reconnectJob = null
                connectSocket(sessionId)
            }
        }
    }

    private fun enqueueFrame(frame: ServerFrame) {
        frameQueue.addLast(frame)
        if (frame.type !in setOf("item-update", "delta") || frameQueue.size >= 128) {
            flushFrames()
        } else if (frameFlushJob == null) {
            frameFlushJob = viewModelScope.launch { delay(32); flushFrames() }
        }
    }

    private fun flushFrames() {
        frameFlushJob?.cancel()
        frameFlushJob = null
        while (frameQueue.isNotEmpty()) handleFrame(frameQueue.removeFirst())
    }

    private fun handleFrame(frame: ServerFrame) {
        when (frame.type) {
            "ready" -> _state.update { it.copy(connected = true, reconnecting = false) }
            "snapshot" -> {
                recoveringAppend = false
                reconnectAttempt = 0
                _state.update { current ->
                current.copy(
                    title = frame.title ?: current.title,
                    cwd = frame.cwd ?: current.cwd,
                    items = frame.items ?: emptyList(),
                    live = frame.live,
                    running = frame.running ?: false,
                    interaction = frame.interactions?.firstOrNull(),
                    connected = true,
                    reconnecting = false,
                    error = null,
                    loadingHistory = false,
                    snapshotError = null,
                    historyNotice = frame.historyNotice,
                )
                }
            }
            "item" -> {
                val item = frame.item ?: return
                _state.update { current ->
                    if (current.items.any { it.id == item.id }) current
                    else current.copy(items = current.items + item, live = if (item.kind == "assistant") null else current.live)
                }
            }
            "item-update" -> {
                val id = frame.id ?: return
                val patch = frame.patch
                if (patch?.textAppend != null) {
                    val item = _state.value.items.find { it.id == id }
                    if (item == null || patch.applyTo(item) == null) {
                        if (!recoveringAppend) {
                            recoveringAppend = true
                            _state.value.current?.id?.let { sessionId ->
                                socket?.send(buildJsonObject { put("type", "subscribe"); put("sessionId", sessionId); put("supportsTextAppend", true) }.toString())
                            }
                        }
                        return
                    }
                }
                _state.update { current ->
                    current.copy(items = current.items.map { item ->
                        if (item.id != id) item
                        else patch?.applyTo(item) ?: item
                    })
                }
            }
            "delta" -> _state.update { current ->
                val live = current.live ?: LiveText()
                val next = if (frame.kind == "reasoning") {
                    live.copy(reasoning = live.reasoning + (frame.text ?: ""))
                } else {
                    live.copy(text = live.text + (frame.text ?: ""))
                }
                current.copy(live = next)
            }
            "live-clear" -> _state.update { it.copy(live = null) }
            "status" -> _state.update { it.copy(running = frame.running ?: it.running) }
            "interaction" -> {
                val interaction = frame.interaction ?: return
                _state.update { it.copy(interaction = interaction) }
            }
            "interaction-resolved" -> _state.update { current ->
                if (frame.id != null && current.interaction?.id == frame.id) current.copy(interaction = null)
                else current
            }
            "error" -> _state.update { it.copy(snapshotError = frame.message ?: "暂时无法同步会话", loadingHistory = false) }
            "closed" -> {
                _state.update { it.copy(connected = false) }
                frame.sessionId?.let { scheduleReconnect(it) }
            }
        }
    }

    private fun onFailure(error: Throwable) {
        if (error is CancellationException) throw error
        if (error is UnauthorizedException) {
            logout("配对已失效，请在电脑上重新生成配对码")
            return
        }
        _state.update { it.copy(error = error.message ?: "网络错误") }
    }

    private fun closeSocket() {
        frameFlushJob?.cancel()
        frameFlushJob = null
        frameQueue.clear()
        recoveringAppend = false
        socketGeneration++
        heartbeatJob?.cancel()
        heartbeatJob = null
        reconnectJob?.cancel()
        reconnectJob = null
        socket?.cancel()
        socket = null
    }

    private fun deviceName(): String {
        val name = "${Build.MANUFACTURER} ${Build.MODEL}".trim()
        return if (name.isEmpty()) "Android 手机" else name.take(60)
    }

    override fun onCleared() {
        connectivity.unregisterNetworkCallback(networkCallback)
        intentionalClose = true
        closeSocket()
        api?.close()
        super.onCleared()
    }

    companion object {
        private const val KEY_BASE = "base-url"
        private const val KEY_COOKIE = "cookie"
    }
}
