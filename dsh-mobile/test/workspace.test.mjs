import test from 'node:test'
import assert from 'node:assert/strict'
import { MobileBridge } from '../lib/mobile-bridge.js'

function fixture() {
  let closed = 0
  const created = []
  const workspace = {
    async *follow() {
      try {
        yield { type: 'baseline', value: { items: [
          { workspaceId: 'workspace-real', title: 'My project', path: 'D:\\Projects\\demo' },
        ], archivedSessionIds: [] } }
      } finally { closed++ }
    },
  }
  const bridge = new MobileBridge({ ctx: {
    get(name) { return name === 'workspaceController' ? workspace : name === 'workingDirectory' ? { defaultDirectory: 'D:\\Default' } : undefined },
    sessionController: { async create(request) { created.push(request); return { sessionId: 'new-session' } } },
  } })
  return { bridge, created, closed: () => closed }
}

test('lists desktop workspaces and releases the baseline subscription', async () => {
  const f = fixture()
  assert.deepEqual(await f.bridge.listWorkspaces(), {
    workspaces: [{ id: 'workspace-real', title: 'My project', path: 'D:\\Projects\\demo' }],
    defaultDirectory: 'D:\\Default',
  })
  assert.equal(f.closed(), 1)
})

test('creates by workspace identity, preserving desktop membership', async () => {
  const f = fixture()
  const result = await f.bridge.createSession({ workspaceId: 'workspace-real' })
  assert.deepEqual(f.created, [{ workspaceId: 'workspace-real' }])
  assert.equal(result.cwd, 'D:\\Projects\\demo')
  assert.equal(f.closed(), 1)
})

test('rejects deleted workspaces and ambiguous workspace/path requests', async () => {
  const f = fixture()
  await assert.rejects(f.bridge.createSession({ workspaceId: 'deleted' }), /工作区已不存在/)
  await assert.rejects(f.bridge.createSession({ workspaceId: 'workspace-real', cwd: 'D:\\Other' }), /不能同时/)
  assert.equal(f.created.length, 0)
})

test('retains custom and default directory creation for compatibility', async () => {
  const f = fixture()
  await f.bridge.createSession({ cwd: 'D:\\Custom' })
  await f.bridge.createSession()
  assert.deepEqual(f.created, [{ cwd: 'D:\\Custom' }, { cwd: 'D:\\Default' }])
})
