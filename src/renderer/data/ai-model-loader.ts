/**
 * 模型列表加载编排（docs/无感配置方案.md「验证即前进」的延续）：
 * 手动「加载模型」按钮与「测试连接成功自动加载」共用；
 * fetchModels 依赖注入便于单测（组件侧传 window.electronAPI.fetchAIModels 即 mock IPC 边界）。
 */
export interface AIModelItem {
  id: string
  name: string
}

export interface AIModelFetchResult {
  success: boolean
  models: AIModelItem[]
  error?: string
}

export interface LoadAIModelsArgs {
  fetchModels: (baseUrl: string, apiKey: string) => Promise<AIModelFetchResult>
  baseUrl: string
  apiKey: string
  /** 当前已选模型（空串/undefined 视为未选） */
  currentModel?: string
}

export interface LoadAIModelsResult {
  ok: boolean
  models: AIModelItem[]
  /** ok 且用户未选模型时 = 建议选中的第一个模型 id */
  autoSelectId?: string
  /** success:false 或空列表时主进程返回的错误文案（组件原样展示） */
  error?: string
  /** IPC 调用本身抛异常时的消息（组件拼「加载失败: 」前缀） */
  thrownError?: string
}

export async function loadAIModels(args: LoadAIModelsArgs): Promise<LoadAIModelsResult> {
  const { fetchModels, baseUrl, apiKey, currentModel } = args
  try {
    const res = await fetchModels(baseUrl, apiKey)
    if (res.success && res.models.length > 0) {
      return {
        ok: true,
        models: res.models,
        autoSelectId: currentModel && currentModel.trim() ? undefined : res.models[0].id,
      }
    }
    return { ok: false, models: [], error: res.error }
  } catch (err) {
    return {
      ok: false,
      models: [],
      thrownError: err instanceof Error ? err.message : String(err),
    }
  }
}
