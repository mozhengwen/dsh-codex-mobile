package com.local.dshmobile

import android.content.ActivityNotFoundException
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.collectIsDraggedAsState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.outlined.AddPhotoAlternate
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.StopCircle
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import kotlinx.coroutines.flow.collect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun DshMobileApp(viewModel: AppViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(state.error) {
        val error = state.error ?: return@LaunchedEffect
        snackbar.showSnackbar(error)
        viewModel.clearError()
    }
    LaunchedEffect(state.notice) {
        val notice = state.notice ?: return@LaunchedEffect
        snackbar.showSnackbar(notice)
        viewModel.clearNotice()
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background,
            contentColor = MaterialTheme.colorScheme.onBackground,
        ) {
            when (state.screen) {
                Screen.Setup -> SetupScreen(viewModel, state)
                Screen.Sessions -> SessionsScreen(viewModel, state)
                Screen.Chat -> ChatScreen(viewModel, state)
            }
        }
        SnackbarHost(
            hostState = snackbar,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(horizontal = 16.dp, vertical = 92.dp)
        ) { data ->
            Snackbar(
                snackbarData = data,
                containerColor = MaterialTheme.colorScheme.surfaceVariant,
                contentColor = MaterialTheme.colorScheme.onSurface,
                shape = RoundedCornerShape(10.dp),
            )
        }
    }
    if (state.selectingWorkspace) WorkspaceDialog(viewModel, state)
}

@Composable
private fun SetupScreen(viewModel: AppViewModel, state: UiState) {
    val context = LocalContext.current
    val keyboard = LocalSoftwareKeyboardController.current
    var url by rememberSaveable { mutableStateOf(state.baseUrl) }
    var code by rememberSaveable { mutableStateOf("") }
    val isCodex = url.contains("/backends/codex")
    val returnBase = state.connections.firstOrNull { it == state.baseUrl } ?: state.connections.firstOrNull()
    BackHandler(enabled = returnBase != null) { returnBase?.let(viewModel::selectConnection) }

    val scanner = rememberLauncherForActivityResult(ScanContract()) { result ->
        val contents = result.contents
        if (contents.isNullOrBlank()) return@rememberLauncherForActivityResult
        if (!viewModel.handleScanned(contents)) {
            if (contents.matches(Regex("\\d{6}"))) code = contents else url = contents
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .statusBarsPadding()
            .imePadding()
            .padding(horizontal = 20.dp)
            .navigationBarsPadding(),
    ) {
        Spacer(Modifier.height(14.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (returnBase != null) IconButton(onClick = { viewModel.selectConnection(returnBase) }) { Icon(Icons.Filled.ArrowBack, "返回任务") }
            DshMark(40.dp)
            Spacer(Modifier.width(11.dp))
            Column {
                Text("DSH", fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onBackground)
                Text(
                    "手机远控",
                    fontSize = 10.5.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        Spacer(Modifier.height(38.dp))
        Text(
            "连接电脑上的 ${if (isCodex) "Codex" else "DSH"}",
            fontSize = 26.sp,
            lineHeight = 32.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = (-0.6).sp,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(9.dp))
        Text(
            if (isCodex) "使用 Codex 手机插件提供的地址和 6 位配对码连接。" else "扫描电脑端「手机远控」里的二维码，或使用 6 位配对码连接。",
            fontSize = 13.sp,
            lineHeight = 20.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(24.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("DSH", "Codex").forEach { name ->
                TextButton(onClick = {
                    val origin = (MobileApi.normalizeBase(url) ?: "").removeSuffix("/backends/codex")
                    url = origin + if (name == "Codex") "/backends/codex" else ""
                }) {
                    RadioButton(selected = (name == "Codex") == isCodex, onClick = null)
                    Text(name)
                }
            }
        }
        state.connections.forEach { base ->
            TextButton(onClick = { viewModel.selectConnection(base) }) {
                Text("返回 ${if (base.endsWith("/backends/codex")) "Codex" else "DSH"} · ${android.net.Uri.parse(base).host}")
            }
        }
        Button(
            onClick = {
                val options = ScanOptions().apply {
                    setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                    setPrompt(context.getString(R.string.scan_prompt))
                    setBeepEnabled(false)
                    setOrientationLocked(false)
                    setBarcodeImageEnabled(false)
                    setCaptureActivity(CustomCaptureActivity::class.java)
                }
                try {
                    scanner.launch(options)
                } catch (_: ActivityNotFoundException) {
                    Toast.makeText(context, R.string.camera_missing, Toast.LENGTH_LONG).show()
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            shape = RoundedCornerShape(12.dp),
        ) {
            Icon(
                Icons.Filled.QrCodeScanner,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = MaterialTheme.colorScheme.onPrimary,
            )
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.scan_button), fontWeight = FontWeight.SemiBold)
        }

        Spacer(Modifier.height(26.dp))
        Text(
            "手动连接",
            fontSize = 9.5.sp,
            letterSpacing = 1.2.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontFamily = FontFamily.Monospace,
        )
        Spacer(Modifier.height(8.dp))
        Surface(
            color = MaterialTheme.colorScheme.surface,
            shape = RoundedCornerShape(16.dp),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        ) {
            Column(Modifier.padding(14.dp)) {
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    label = { Text(stringResource(R.string.url_hint), fontSize = 11.sp) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    shape = RoundedCornerShape(10.dp),
                    textStyle = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it.filter(Char::isDigit).take(6) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    label = { Text(stringResource(R.string.code_hint), fontSize = 11.sp) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { keyboard?.hide(); if (code.length == 6 && !state.pairing) viewModel.pair(url, code) }),
                    shape = RoundedCornerShape(10.dp),
                    textStyle = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(10.dp))
                Button(
                    onClick = {
                        keyboard?.hide()
                        viewModel.pair(url, code)
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(44.dp),
                    enabled = !state.pairing,
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                        contentColor = MaterialTheme.colorScheme.onSurface,
                    ),
                ) {
                    if (state.pairing) {
                        CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 1.8.dp)
                        Spacer(Modifier.width(8.dp))
                        Text(stringResource(R.string.pairing), fontSize = 13.sp)
                    } else {
                        Text(if (isCodex) "连接 Codex" else stringResource(R.string.connect_button), fontSize = 13.sp)
                    }
                }
            }
        }

        Spacer(Modifier.height(18.dp))
        Text(
            text = if (isCodex) "手机和电脑连接互联网即可，电脑端需保持 Codex 和手机网关运行。" else stringResource(R.string.same_wifi),
            fontSize = 11.sp,
            lineHeight = 17.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(7.dp))
        Text(
            text = if (isCodex) "只连接你信任的电脑。配对后可操作电脑上的 Codex 任务。" else stringResource(R.string.privacy_note),
            fontSize = 10.sp,
            lineHeight = 15.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.62f),
        )
        Spacer(Modifier.height(24.dp))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SessionsScreen(viewModel: AppViewModel, state: UiState) {
    var menu by remember { mutableStateOf(false) }
    var about by remember { mutableStateOf(false) }
    Scaffold(containerColor = MaterialTheme.colorScheme.background, topBar = {
        TopAppBar(title = {
            ConnectionSwitcher(state, viewModel)
        }, colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background), actions = {
            FilledIconButton(onClick = viewModel::chooseWorkspace, enabled = !state.creatingSession, modifier = Modifier.size(42.dp)) {
                Icon(Icons.Filled.Add, "新建任务", Modifier.size(22.dp))
            }
            Spacer(Modifier.width(4.dp))
            IconButton(onClick = viewModel::refreshSessions, enabled = !state.loadingSessions) { Icon(Icons.Filled.Refresh, "刷新任务", Modifier.size(22.dp)) }
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, "更多") }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(text = { Text("重新配对当前连接") }, onClick = { menu = false; viewModel.logout() })
                    DropdownMenuItem(text = { Text("关于手机远控") }, onClick = { menu = false; about = true })
                }
            }
        })
    }) { padding ->
        androidx.compose.material3.pulltorefresh.PullToRefreshBox(isRefreshing = state.loadingSessions, onRefresh = viewModel::refreshSessions, modifier = Modifier.padding(padding).fillMaxSize()) {
            androidx.compose.runtime.key(state.baseUrl) { SessionBrowser(state, viewModel) }
        }
    }
    if (about) androidx.compose.material3.AlertDialog(onDismissRequest = { about = false }, title = { Text("手机远控") },
        text = { Text("版本 ${BuildConfig.VERSION_NAME}\n在手机继续电脑上的 DSH 与 Codex 任务。\n\n${if (state.isCodex) "Codex 审批和提问请在电脑处理。" else "任务和工具在电脑上执行。"}") },
        confirmButton = { TextButton(onClick = { about = false }) { Text("知道了") } })
}

@Composable
internal fun SessionRow(session: SessionDto, showDirectory: Boolean = true, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).heightIn(min = 66.dp).padding(horizontal = 22.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(6.dp).background(if (session.running) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.outline, CircleShape))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(session.title.ifBlank { "新任务" }, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (session.running || session.blank) {
                    Text(if (session.running) "进行中" else "待发送", fontSize = 10.sp, lineHeight = 16.sp, color = if (session.running) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(" · ", fontSize = 10.sp, lineHeight = 16.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(if (showDirectory && session.cwd.isNotBlank()) session.cwd else relativeTime(session.updatedAt), fontSize = 10.5.sp, lineHeight = 16.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            }
        }
        if (showDirectory) Text(relativeTime(session.updatedAt), fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 8.dp))
        Icon(Icons.Filled.ChevronRight, null, Modifier.padding(start = 10.dp).size(17.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
@Composable
private fun DshMark(size: androidx.compose.ui.unit.Dp) {
    Icon(painterResource(R.drawable.dsh_mark), contentDescription = "DeepSeek Harness",
        tint = MaterialTheme.colorScheme.onBackground, modifier = Modifier.size(size))
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ChatScreen(viewModel: AppViewModel, state: UiState) {
    var menu by remember { mutableStateOf(false) }
    var rename by remember { mutableStateOf(false) }
    var newTitle by remember(state.current?.id) { mutableStateOf(state.title) }
    var modelDialog by remember { mutableStateOf(false) }
    var questionDialog by remember { mutableStateOf(false) }
    val composer = state.composer
    val scope = rememberCoroutineScope()
    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(4)) { uris -> viewModel.addImages(uris) }
    val listState = rememberLazyListState()

    BackHandler { viewModel.closeChat() }

    val live = state.live
    val entries = remember(state.items, live?.reasoning) { conversationEntries(state.items, live) }
    val itemCount = entries.size + if (!live?.text.isNullOrBlank()) 1 else 0
    var positioned by rememberSaveable(state.current?.id) { mutableStateOf(false) }
    var followLatest by remember(state.current?.id) { mutableStateOf(true) }
    val userDragging = listState.interactionSource.collectIsDraggedAsState()
    LaunchedEffect(listState) {
        var userScrolled = false
        snapshotFlow { listState.isScrollInProgress to userDragging.value }.collect { (scrolling, dragging) ->
            if (dragging) userScrolled = true
            if (!scrolling && userScrolled) {
                followLatest = !listState.canScrollForward
                userScrolled = false
            }
        }
    }
    val streamingSize = state.items.lastOrNull { it.streaming }?.text?.length ?: 0
    LaunchedEffect(itemCount, live?.text?.length, live?.reasoning?.length, streamingSize, state.loadingHistory) {
        if (itemCount > 0 && !positioned) {
            listState.scrollToItem(itemCount)
            positioned = true
        } else if (itemCount > 0 && followLatest && !listState.isScrollInProgress) listState.scrollToItem(itemCount)
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                navigationIcon = {
                    IconButton(onClick = viewModel::closeChat) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "返回")
                    }
                },
                title = {
                    Column {
                        Text(
                            state.title.ifBlank { state.current?.title ?: "会话" },
                            fontSize = 15.sp,
                            lineHeight = 23.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            ConnectionSwitcher(state, viewModel, compact = true)
                            Spacer(Modifier.width(7.dp))
                            Text(
                                if (!state.connected) "正在连接电脑端…"
                                else if (state.running) "电脑端正在执行"
                                else if (state.loadingHistory) "正在同步"
                                else "已连接",
                                fontSize = 10.5.sp,
                                lineHeight = 16.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                    titleContentColor = MaterialTheme.colorScheme.onBackground,
                ),
                actions = {
                    Box {
                        IconButton(onClick = { menu = true }) {
                            Icon(Icons.Filled.MoreVert, contentDescription = "更多")
                        }
                        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                            DropdownMenuItem(text = { Text("重命名任务") }, onClick = { menu = false; newTitle = state.title; rename = true })
                            DropdownMenuItem(
                                text = { Text("重新连接") },
                                onClick = { menu = false; viewModel.reconnect() },
                            )
                            DropdownMenuItem(
                                text = { Text("返回会话列表") },
                                onClick = { menu = false; viewModel.closeChat() },
                            )
                            DropdownMenuItem(
                                text = { Text("重新配对") },
                                enabled = !state.sending && !state.addingImages,
                                onClick = { menu = false; viewModel.logout() },
                            )
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .imePadding()
        ) {
            if (!state.connected && state.reconnecting) {
                Surface(color = MaterialTheme.colorScheme.tertiary.copy(alpha = 0.12f)) {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            Icons.Filled.WarningAmber,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.tertiary,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(Modifier.width(7.dp))
                        Text(
                                "正在恢复电脑连接…",
                            modifier = Modifier.weight(1f),
                            fontSize = 11.5.sp,
                            color = MaterialTheme.colorScheme.tertiary,
                        )
                        TextButton(onClick = viewModel::reconnect) { Text("立即重连") }
                    }
                }
            }

            state.snapshotError?.let { InlineNotice(it, "重试", viewModel::reconnect) }
            state.historyNotice?.let { Text(it, Modifier.padding(horizontal = 20.dp, vertical = 6.dp), fontSize = 10.sp, lineHeight = 16.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }

            Box(
                Modifier
                    .weight(1f)
                    .fillMaxWidth()
            ) {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize().clipToBounds(),
                    contentPadding = PaddingValues(20.dp, 18.dp, 20.dp, 20.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    if (state.loadingHistory && state.items.isEmpty()) item(key = "loading") {
                        Row(Modifier.fillMaxWidth().padding(vertical = 32.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                            Text("正在同步会话…", Modifier.padding(start = 10.dp), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    if (!state.loadingHistory && state.snapshotError == null && state.items.isEmpty() && live == null) {
                        item(key = "empty") {
                            Column(
                                Modifier
                                    .fillMaxWidth()
                                    .padding(top = 70.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                BackendMark(state.isCodex, Modifier.size(44.dp))
                                Spacer(Modifier.height(20.dp))
                                Text("想从哪里开始？", fontSize = 23.sp, fontWeight = FontWeight.SemiBold)
                                Spacer(Modifier.height(10.dp))
                                Text(
                                    state.cwd.ifBlank { "与桌面 ${state.backendName} 一起处理任务" },
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                )
                            }
                        }
                    }
                    items(entries, key = { it.key }) { entry ->
                        when (entry) {
                            is ConversationEntry.Message -> ChatItemRow(entry.item, viewModel, state.backendName)
                            is ConversationEntry.Activity -> ActivityGroup(entry, state.running)
                        }
                    }
                    if (live != null && live.text.isNotBlank()) {
                        item(key = "live") { LiveAssistantRow(live, state.backendName) }
                    }
                    if (itemCount > 0) item(key = "bottom-anchor") { Spacer(Modifier.height(1.dp)) }
                }
                if (positioned && listState.canScrollForward) androidx.compose.material3.SmallFloatingActionButton(
                    onClick = { scope.launch { listState.animateScrollToItem(itemCount); followLatest = true } },
                    containerColor = MaterialTheme.colorScheme.surfaceVariant, contentColor = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 12.dp)) { Icon(Icons.Filled.ArrowDownward, "回到最新消息", Modifier.size(20.dp)) }
            }

            state.interaction?.let { interaction ->
                InteractionCard(
                    interaction = interaction,
                    onAllow = viewModel::answerApproval,
                    onOpenQuestions = { questionDialog = true },
                )
            }

            if (state.pendingImages.isNotEmpty()) PendingImagesRow(state.pendingImages, !state.sending, viewModel::removeImage)
            if (state.addingImages) Text("正在准备图片…", Modifier.padding(horizontal = 20.dp), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Composer(
                backendName = state.backendName,
                modelLabel = state.modelSettings?.selected?.let { "${it.model} · ${effortLabel(it.reasoningEffort)}" } ?: "模型与思考",
                onModelClick = { modelDialog = true; if (state.modelSettings == null) viewModel.loadModels() },
                text = composer,
                onTextChange = viewModel::updateComposer,
                running = state.running,
                sending = state.sending,
                hasImages = state.pendingImages.isNotEmpty(),
                addingImages = state.addingImages,
                onPickImages = { imagePicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                onSend = {
                    if (composer.isNotBlank() || state.pendingImages.isNotEmpty()) {
                        viewModel.send(composer)
                    }
                },
                onStop = viewModel::cancelTurn,
            )
        }
    }

    val interaction = state.interaction
    if (modelDialog) ModelDialog(state, viewModel) { modelDialog = false }
    if (rename) androidx.compose.material3.AlertDialog(onDismissRequest = { rename = false }, title = { Text("重命名任务") },
        text = { OutlinedTextField(value = newTitle, onValueChange = { newTitle = it.take(200) }, singleLine = true, label = { Text("任务名称") }) },
        confirmButton = { TextButton(enabled = newTitle.isNotBlank(), onClick = { viewModel.renameCurrent(newTitle); rename = false }) { Text("保存") } },
        dismissButton = { TextButton(onClick = { rename = false }) { Text("取消") } })
    if (questionDialog && interaction?.kind == "question" && interaction.questions != null) {
        QuestionDialog(
            interaction = interaction,
            onDismiss = { questionDialog = false },
            onSubmit = {
                questionDialog = false
                viewModel.answerQuestions(it)
            },
        )
    }
}

@Composable
private fun ChatItemRow(item: ChatItem, viewModel: AppViewModel, backendName: String) {
    when (item.kind) {
        "user" -> {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                Surface(
                    color = MaterialTheme.colorScheme.primaryContainer,
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.widthIn(max = 330.dp),
                ) {
                    Column {
                        if (item.images.isNotEmpty()) MessageImages(item.images, viewModel)
                        if (item.text.isNotBlank()) Text(
                            item.text,
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                            fontSize = 15.sp,
                            lineHeight = 24.sp,
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                        )
                    }
                }
            }
        }
        "assistant" -> {
            val clipboard = LocalClipboardManager.current
            var copied by remember(item.id) { mutableStateOf(false) }
            LaunchedEffect(copied) { if (copied) { delay(1800); copied = false } }
            Column(Modifier.fillMaxWidth()) {
                if (item.text.isNotBlank()) {
                    if (item.streaming) LiveAssistantRow(LiveText(text = item.text), backendName)
                    else MarkdownText(item.text, MaterialTheme.colorScheme.onBackground)
                    if (!item.streaming) TextButton(onClick = { clipboard.setText(AnnotatedString(item.text)); copied = true }, contentPadding = PaddingValues(horizontal = 4.dp), modifier = Modifier.height(40.dp)) {
                        Icon(Icons.Outlined.ContentCopy, null, Modifier.size(16.dp))
                        Text(if (copied) "已复制" else "复制", Modifier.padding(start = 5.dp), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                if (item.interrupted) {
                    Text(
                        "已中断",
                        fontSize = 10.5.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
        }
        "error" -> {
            Surface(
                color = MaterialTheme.colorScheme.errorContainer,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.Top) {
                    Icon(
                        Icons.Filled.ErrorOutline,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(17.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(item.text, fontSize = 12.5.sp, color = MaterialTheme.colorScheme.onErrorContainer)
                }
            }
        }
        else -> {
            if (item.text.isNotBlank()) {
                Text(item.text, fontSize = 12.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun LiveAssistantRow(live: LiveText, backendName: String) {
    val transition = rememberInfiniteTransition(label = "stream-cursor")
    val cursorAlpha by transition.animateFloat(
        initialValue = 0.2f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(620), RepeatMode.Reverse),
        label = "cursor-alpha",
    )
    Column(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(6.dp)
                    .graphicsLayer { alpha = cursorAlpha }
                    .background(MaterialTheme.colorScheme.secondary, CircleShape)
            )
            Spacer(Modifier.width(7.dp))
            Text(
                "$backendName 正在生成",
                fontSize = 10.5.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        val visible = live.text
        if (visible.isNotBlank()) {
            Spacer(Modifier.height(5.dp))
            SelectionContainer {
                Text(
                    visible,
                    fontSize = 14.5.sp,
                    lineHeight = 23.sp,
                    color = MaterialTheme.colorScheme.onBackground,
                )
            }
        } else {
            Spacer(Modifier.height(5.dp))
            Text(
                "正在思考…",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun InteractionCard(
    interaction: Interaction,
    onAllow: (Boolean) -> Unit,
    onOpenQuestions: () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.tertiary.copy(alpha = 0.55f)),
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomStart = 0.dp, bottomEnd = 0.dp),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.WarningAmber,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.tertiary,
                    modifier = Modifier.size(19.dp),
                )
                Spacer(Modifier.width(7.dp))
                Text(
                    if (interaction.kind == "approval") "电脑端需要你的批准" else "电脑端需要你回答",
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 13.5.sp,
                )
            }
            if (interaction.kind == "approval") {
                if (!interaction.toolName.isNullOrBlank()) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        interaction.toolName,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.5.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (interaction.prompt.isNotBlank()) {
                    Spacer(Modifier.height(5.dp))
                    Text(interaction.prompt, fontSize = 12.sp, lineHeight = 18.sp)
                }
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = { onAllow(true) },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                    ) { Text("允许一次") }
                    Button(
                        onClick = { onAllow(false) },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant,
                            contentColor = MaterialTheme.colorScheme.error,
                        ),
                    ) { Text("拒绝") }
                }
            } else {
                val first = interaction.questions?.firstOrNull()
                if (first != null) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        first.header ?: first.question,
                        fontSize = 12.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Spacer(Modifier.height(10.dp))
                Button(
                    onClick = onOpenQuestions,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("回答问题") }
            }
        }
    }
}

@Composable
private fun Composer(
    backendName: String = "DSH",
    modelLabel: String,
    onModelClick: () -> Unit,
    text: String,
    onTextChange: (String) -> Unit,
    running: Boolean,
    sending: Boolean,
    hasImages: Boolean = false,
    addingImages: Boolean = false,
    onPickImages: () -> Unit,
    onSend: () -> Unit,
    onStop: () -> Unit,
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 8.dp)
            .navigationBarsPadding(),
        color = if (androidx.compose.foundation.isSystemInDarkTheme()) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.background,
        shape = RoundedCornerShape(20.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Column(Modifier.padding(horizontal = 8.dp, vertical = 6.dp)) {
            BasicTextField(
                value = text,
                onValueChange = onTextChange,
                enabled = !sending,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 46.dp)
                    .padding(horizontal = 8.dp, vertical = 10.dp),
                textStyle = TextStyle(
                    color = MaterialTheme.colorScheme.onSurface,
                    fontSize = 14.sp,
                    lineHeight = 21.sp,
                ),
                maxLines = 5,
                cursorBrush = SolidColor(MaterialTheme.colorScheme.secondary),
                decorationBox = { inner ->
                    if (text.isBlank()) {
                        Text(
                            "给 $backendName 发送消息…",
                            fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.72f),
                        )
                    }
                    inner()
                },
            )
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onPickImages, enabled = !sending && !addingImages, modifier = Modifier.size(44.dp)) {
                Icon(Icons.Outlined.AddPhotoAlternate, "添加图片", Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            TextButton(onClick = onModelClick, enabled = !sending, modifier = Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 4.dp)) {
                Text(modelLabel, Modifier.weight(1f), fontSize = 10.sp, lineHeight = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Icon(Icons.Filled.ExpandMore, "选择模型与思考等级", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (running) {
                IconButton(onClick = onStop, modifier = Modifier.size(44.dp)) {
                    Icon(
                        Icons.Filled.Stop,
                        contentDescription = "停止",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(20.dp),
                    )
                }
            }
            FilledIconButton(
                onClick = onSend,
                enabled = (text.isNotBlank() || hasImages) && !sending && !addingImages,
                modifier = Modifier
                    .padding(bottom = 4.dp)
                    .size(44.dp),
            ) {
                if (sending) {
                    CircularProgressIndicator(
                        Modifier.size(16.dp),
                        strokeWidth = 1.8.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                } else {
                    Icon(
                        Icons.Filled.ArrowUpward,
                        contentDescription = "发送",
                        modifier = Modifier.size(20.dp),
                    )
                }
            }
            }
        }
    }
}

@Composable
private fun QuestionDialog(
    interaction: Interaction,
    onDismiss: () -> Unit,
    onSubmit: (List<QuestionAnswer>) -> Unit,
) {
    val questions = interaction.questions.orEmpty()
    val selected = remember(interaction.id) { mutableStateMapOf<String, Set<String>>() }
    val custom = remember(interaction.id) { mutableStateMapOf<String, String>() }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.93f)
                .heightIn(max = 650.dp),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column(Modifier.padding(20.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("DSH 需要你回答", fontWeight = FontWeight.Bold, fontSize = 18.sp, modifier = Modifier.weight(1f))
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Filled.Close, contentDescription = "关闭")
                    }
                }
                Spacer(Modifier.height(4.dp))
                Column(
                    Modifier
                        .weight(1f, fill = false)
                        .verticalScroll(rememberScrollState())
                ) {
                    questions.forEach { question ->
                        if (!question.header.isNullOrBlank()) {
                            Text(
                                question.header,
                                fontSize = 10.5.sp,
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(top = 10.dp),
                            )
                        }
                        Text(
                            question.question,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(top = 7.dp, bottom = 4.dp),
                        )
                        if (!question.detail.isNullOrBlank()) {
                            Text(
                                question.detail,
                                fontSize = 12.sp,
                                lineHeight = 18.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        question.options.orEmpty().forEach { option ->
                            val current = selected[question.id].orEmpty()
                            val checked = option.label in current
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        val next = when {
                                            question.multiSelect && checked -> current - option.label
                                            question.multiSelect -> current + option.label
                                            checked -> emptySet()
                                            else -> setOf(option.label)
                                        }
                                        selected[question.id] = next
                                    }
                                    .padding(vertical = 3.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                if (question.multiSelect) {
                                    Checkbox(checked = checked, onCheckedChange = null)
                                } else {
                                    RadioButton(selected = checked, onClick = null)
                                }
                                Column(Modifier.padding(start = 4.dp)) {
                                    Text(option.label, fontSize = 13.sp)
                                    if (!option.description.isNullOrBlank()) {
                                        Text(
                                            option.description,
                                            fontSize = 11.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            }
                        }
                        OutlinedTextField(
                            value = custom[question.id].orEmpty(),
                            onValueChange = { custom[question.id] = it },
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 8.dp),
                            label = { Text("其他 / 自定义回答", fontSize = 11.sp) },
                            minLines = 1,
                            maxLines = 3,
                            shape = RoundedCornerShape(10.dp),
                            textStyle = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
                Spacer(Modifier.height(14.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    TextButton(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                    ) { Text("稍后回答") }
                    Button(
                        onClick = {
                            onSubmit(questions.map { question ->
                                QuestionAnswer(
                                    id = question.id,
                                    selected = selected[question.id].orEmpty().toList(),
                                    custom = custom[question.id]?.trim()?.takeIf { it.isNotEmpty() },
                                )
                            })
                        },
                        modifier = Modifier.weight(1f),
                    ) { Text("提交回答") }
                }
            }
        }
    }
}

private fun relativeTime(timestamp: Long): String {
    if (timestamp <= 0) return ""
    val diff = (System.currentTimeMillis() - timestamp).coerceAtLeast(0)
    return when {
        diff < 60_000 -> "刚刚"
        diff < 3_600_000 -> "${diff / 60_000} 分钟前"
        diff < 86_400_000 -> "${diff / 3_600_000} 小时前"
        else -> SimpleDateFormat("MM-dd HH:mm", Locale.getDefault()).format(Date(timestamp))
    }
}
