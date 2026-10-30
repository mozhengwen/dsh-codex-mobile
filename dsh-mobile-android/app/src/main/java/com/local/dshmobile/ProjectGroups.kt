package com.local.dshmobile

data class ProjectGroup(val id: String, val title: String, val path: String, val sessions: List<SessionDto>)

private fun normalizedPath(path: String): String {
    val clean = path.replace('\\', '/').trimEnd('/').ifEmpty { if (path.startsWith('/')) "/" else "" }
    return if (path.contains('\\') || Regex("^[a-zA-Z]:").containsMatchIn(clean)) clean.lowercase() else clean
}

fun projectGroups(sessions: List<SessionDto>, workspaces: List<WorkspaceDto>, query: String = ""): List<ProjectGroup> {
    val filter = query.trim()
    data class Key(val id: String, val title: String, val path: String)
    return sessions.map { session ->
        val cwd = normalizedPath(session.cwd)
        val exact = workspaces.find { it.id == session.projectId && it.hostId == session.hostId }
        val workspace = exact ?: workspaces.filter { it.hostId == session.hostId && it.path.isNotBlank() }
            .filter { cwd == normalizedPath(it.path) || cwd.startsWith(normalizedPath(it.path).trimEnd('/') + "/") }
            .maxByOrNull { normalizedPath(it.path).length }
        val path = workspace?.path ?: session.cwd
        val title = workspace?.title?.ifBlank { null } ?: path.replace('\\', '/').trimEnd('/').substringAfterLast('/').ifBlank { "未分配项目" }
        val key = Key(session.hostId + ":" + (workspace?.id ?: session.projectId ?: normalizedPath(path)), title, path)
        key to session
    }.filter { (key, session) -> filter.isBlank() || listOf(key.title, key.path, session.title, session.cwd).any { it.contains(filter, ignoreCase = true) } }
        .groupBy { it.first.id }
        .map { (_, members) -> val key = members.first().first; ProjectGroup(key.id, key.title, key.path, members.map { it.second }.sortedByDescending { it.updatedAt }) }
        .sortedByDescending { group -> group.sessions.maxOfOrNull { it.updatedAt } ?: 0 }
}
