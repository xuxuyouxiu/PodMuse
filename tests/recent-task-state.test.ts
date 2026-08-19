import { describe, it, expect } from 'vitest'
import {
  startRecentTask,
  completeRecentTask,
  failRecentTask,
  stopRecentTask,
  reconcileRecentTasksWithBatch,
} from '../src/main/recent-task-state'
import type { FeishuState } from '../src/shared/types'

function emptyState(): FeishuState {
  return { processed: [], processedUrls: [], activeTasks: [], recentTasks: [] }
}

describe('startRecentTask', () => {
  it('registers a running task with the prefetched title', () => {
    const state = startRecentTask(emptyState(), {
      id: 'batch_1',
      url: 'https://example.com/ep1',
      episodeId: 'ep1',
      title: '第一期标题',
    })
    expect(state.activeTasks).toHaveLength(1)
    expect(state.activeTasks[0].status).toBe('running')
    expect(state.activeTasks[0].title).toBe('第一期标题')
  })
})

describe('completeRecentTask 跨列表定位（一致性巡检移走任务后仍能回填终态）', () => {
  it('updates a task that was orphan-moved to recentTasks', () => {
    // 模拟：任务处理中被巡检从 activeTasks 移到 recentTasks 并标为 stopped
    const orphaned: FeishuState = {
      ...emptyState(),
      recentTasks: [
        {
          id: 'batch_1',
          url: 'https://example.com/ep1',
          episodeId: 'ep1',
          status: 'stopped',
          title: null,
          filename: null,
          updatedAt: 1000,
        },
      ],
    }
    const updated = completeRecentTask(orphaned, {
      taskId: 'batch_1',
      url: 'https://example.com/ep1',
      episodeId: 'ep1',
      filename: '分类\第一期标题.md',
      title: '第一期标题',
    })
    expect(updated.recentTasks).toHaveLength(1)
    expect(updated.recentTasks[0].status).toBe('completed')
    expect(updated.recentTasks[0].title).toBe('第一期标题')
    expect(updated.recentTasks[0].filename).toBe('分类\第一期标题.md')
  })

  it('keeps the prefetched title when the final title is missing', () => {
    let state = startRecentTask(emptyState(), {
      id: 'batch_2',
      url: 'https://example.com/ep2',
      episodeId: 'ep2',
      title: '预取标题',
    })
    state = completeRecentTask(state, {
      taskId: 'batch_2',
      url: 'https://example.com/ep2',
      episodeId: 'ep2',
      filename: 'note.md',
      title: null,
    })
    expect(state.recentTasks[0].status).toBe('completed')
    expect(state.recentTasks[0].title).toBe('预取标题')
  })
})

describe('failRecentTask / stopRecentTask 按身份定位', () => {
  it('fails the right task even after it was moved to recentTasks', () => {
    const state: FeishuState = {
      ...emptyState(),
      recentTasks: [
        {
          id: 'batch_1',
          url: 'https://example.com/ep1',
          episodeId: 'ep1',
          status: 'stopped',
          title: '失败的这期',
          filename: null,
          updatedAt: 1000,
        },
        {
          id: 'other',
          url: 'https://example.com/other',
          episodeId: null,
          status: 'completed',
          title: '另一期',
          filename: 'other.md',
          updatedAt: 2000,
        },
      ],
    }
    const updated = failRecentTask(state, '处理返回空结果', {
      taskId: 'batch_1',
      url: 'https://example.com/ep1',
      episodeId: 'ep1',
      title: '失败的这期',
    })
    const failed = updated.recentTasks.find(t => t.id === 'batch_1')
    const other = updated.recentTasks.find(t => t.id === 'other')
    expect(failed?.status).toBe('error')
    expect(failed?.error).toBe('处理返回空结果')
    expect(other?.status).toBe('completed')
  })

  it('stops the targeted task without touching others', () => {
    let state = startRecentTask(emptyState(), {
      id: 'batch_1',
      url: 'https://example.com/ep1',
      episodeId: 'ep1',
      title: null,
    })
    state = startRecentTask(state, {
      id: 'batch_2',
      url: 'https://example.com/ep2',
      episodeId: 'ep2',
      title: null,
    })
    const updated = stopRecentTask(state, {
      taskId: 'batch_1',
      url: 'https://example.com/ep1',
      episodeId: 'ep1',
    })
    const stopped = updated.activeTasks.find(t => t.id === 'batch_1')
    const running = updated.activeTasks.find(t => t.id === 'batch_2')
    expect(stopped?.status).toBe('stopped')
    expect(running?.status).toBe('running')
  })
})

describe('reconcileRecentTasksWithBatch（启动对账修复历史遗留）', () => {
  it('repairs stopped entries to completed with title when the batch task completed', () => {
    const state: FeishuState = {
      ...emptyState(),
      recentTasks: [
        {
          id: 'batch_1',
          url: 'https://www.ximalaya.com/sound/1',
          episodeId: '1',
          status: 'stopped',
          title: null,
          filename: null,
          updatedAt: 1000,
        },
      ],
    }
    const updated = reconcileRecentTasksWithBatch(state, [
      { id: 'batch_1', status: 'completed', title: '真实标题', filename: '分类\真实标题.md' },
    ])
    expect(updated.recentTasks[0].status).toBe('completed')
    expect(updated.recentTasks[0].title).toBe('真实标题')
    expect(updated.recentTasks[0].filename).toBe('分类\真实标题.md')
  })

  it('repairs stopped entries to error when the batch task failed', () => {
    const state: FeishuState = {
      ...emptyState(),
      activeTasks: [
        {
          id: 'batch_1',
          url: 'https://example.com/ep1',
          episodeId: null,
          status: 'stopped',
          title: '失败这期',
          filename: null,
          updatedAt: 1000,
        },
      ],
    }
    const updated = reconcileRecentTasksWithBatch(state, [
      { id: 'batch_1', status: 'failed', title: '失败这期', failureReason: '处理返回空结果' },
    ])
    expect(updated.activeTasks).toHaveLength(0)
    expect(updated.recentTasks[0].status).toBe('error')
    expect(updated.recentTasks[0].error).toBe('处理返回空结果')
  })

  it('leaves unrelated and already-consistent tasks untouched', () => {
    const state: FeishuState = {
      ...emptyState(),
      recentTasks: [
        {
          id: 'other',
          url: 'https://example.com/other',
          episodeId: null,
          status: 'completed',
          title: '保持一致',
          filename: 'other.md',
          updatedAt: 2000,
        },
      ],
    }
    const updated = reconcileRecentTasksWithBatch(state, [
      { id: 'batch_1', status: 'completed', title: '无关任务' },
    ])
    expect(updated).toBe(state)
  })
})
