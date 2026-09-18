// frontend/src/types/chat.ts

/** 单条消息 */
export interface Message {
  id: string
  role: 'ai' | 'user'
  content: string
  html?: string
  /** AI 推理步骤 */
  steps?: ThoughtStep[]
  status: 'local' | 'loading' | 'success' | 'error'
}

/** 思维链步骤 */
export interface ThoughtStep {
  key?: string
  title?: string
  description?: string
  content?: string
  status?: 'pending' | 'loading' | 'success' | 'error'
  icon?: any
}

/** AI 聊天响应格式 */
export interface ChatResponse {
  html?: string
  text?: string
  steps?: ThoughtStep[]
  error?: string
}
