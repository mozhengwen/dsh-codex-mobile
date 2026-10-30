const profiles = [
  { turnLimit: 10, includeOutputs: true, maxOutputCharsPerItem: 8000 },
  { turnLimit: 10, includeOutputs: false, maxOutputCharsPerItem: 2000 },
  { turnLimit: 3, includeOutputs: false, maxOutputCharsPerItem: 2000 },
  { turnLimit: 1, includeOutputs: false, maxOutputCharsPerItem: 1000 },
]
const tooLarge = error => /size limit|oversized|response.*too large|响应.*过大|超过.*大小/i.test(error.message || '')

export class ThreadReader {
  constructor(desktop, context) { this.desktop = desktop; this.context = context; this.profiles = new Map() }
  async read(threadId, hostId = 'local') {
    const key = hostId + ':' + threadId
    for (let level = this.profiles.get(key) || 0; level < profiles.length; level++) {
      const profile = profiles[level]
      try {
        const value = await this.desktop.call('read_thread', { threadId, hostId, ...profile }, this.context)
        this.profiles.set(key, level)
        return { value, historyNotice: level ? `当前显示最近 ${profile.turnLimit} 轮；工具完整输出请在电脑查看` : null }
      } catch (error) {
        if (!tooLarge(error)) throw error
        this.profiles.set(key, Math.min(level + 1, profiles.length - 1))
        if (level === profiles.length - 1) throw new Error('这轮会话超过桌面读取限制，暂时无法同步。可在电脑查看完整内容，稍后重试。')
      }
    }
  }
}
