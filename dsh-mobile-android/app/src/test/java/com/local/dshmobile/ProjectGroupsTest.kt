package com.local.dshmobile

import org.junit.Assert.*
import org.junit.Test

class ProjectGroupsTest {
    @Test fun picksDeepestRegisteredRootAndHonorsWindowsCaseAndBoundaries() {
        val roots = listOf(WorkspaceDto("p1", "App", "D:\\App"), WorkspaceDto("p2", "Nested", "D:\\App\\Nested"))
        val rows = listOf(SessionDto("a", "Recent", "d:\\app\\Nested\\work", 30), SessionDto("b", "Older", "D:/APP/test", 10), SessionDto("c", "Other", "D:/Apple", 20))
        val groups = projectGroups(rows, roots)
        assertEquals(listOf("Nested", "Apple", "App"), groups.map { it.title })
        assertEquals("a", groups[0].sessions[0].id)
    }
    @Test fun explicitProjectAndHostIdentityKeepWorktreesTogetherWithoutKeyCollisions() {
        val rows = listOf(SessionDto("a", cwd = "D:/repo", projectId = "p1"), SessionDto("b", cwd = "D:/worktree", projectId = "p1"), SessionDto("c", cwd = "D:/repo", projectId = "p1", hostId = "remote"))
        val groups = projectGroups(rows, emptyList())
        assertEquals(2, groups.size)
        assertEquals(2, groups.first { it.id == "local:p1" }.sessions.size)
        assertEquals(groups.size, groups.map { it.id }.distinct().size)
    }
    @Test fun searchFindsProjectNamesAndLinuxPathsRemainCaseSensitive() {
        val roots = listOf(WorkspaceDto("p", "机器人", "/Repo"))
        val rows = listOf(SessionDto("a", "任务 A", "/Repo/app"), SessionDto("b", "任务 B", "/repo/app"))
        assertEquals(listOf("a"), projectGroups(rows, roots, "机器人").flatMap { it.sessions }.map { it.id })
        assertEquals(2, projectGroups(rows, roots).size)
    }
}
