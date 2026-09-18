// frontend/src/composables/useChat.ts
import { computed, ref, toValue } from 'vue'
import { useXAgent, useXChat, XStream } from 'ant-design-x-vue'
import type { MessageStatus } from 'ant-design-x-vue'
import { useAuthStore } from '@/stores/auth'

export interface ChatMessage {
  id: string
  role: 'ai' | 'user'
  content: string
  html?: string
  steps?: any[]
  status: MessageStatus
}

export function useChat() {
  const isLoading = ref(false)
  const authStore = useAuthStore()

  // useXAgent: 配置 AI 请求代理
  const [agent] = useXAgent<string, { message: string; messages: any[] }, any>({
    request: async (
      { message },
      { onUpdate, onSuccess, onError, onStream },
    ) => {
      isLoading.value = true
      const controller = new AbortController()
      onStream?.(controller)

      try {
        if (!authStore.token) {
          throw new Error('未登录，请重新登录')
        }

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authStore.token}`,
          },
          body: JSON.stringify({ message }),
          signal: controller.signal,
        })

        if (!response.ok) {
          let errorMsg = `HTTP ${response.status}`
          try {
            const errData = await response.json()
            errorMsg = errData.error || errorMsg
          } catch {
            const text = await response.text().catch(() => '')
            errorMsg = text.slice(0, 200) || errorMsg
          }
          if (response.status === 401) {
            authStore.logout()
            errorMsg = '登录已过期，请重新登录'
          }
          throw new Error(errorMsg)
        }

        // 检查响应是否为流式 (SSE)
        const contentType = response.headers.get('content-type') || ''
        if (contentType.includes('text/event-stream')) {
          // SSE 流式响应
          const stream = XStream({
            readableStream: response.body!,
          })
          const chunks: any[] = []
          for await (const chunk of stream) {
            chunks.push(chunk)
            onUpdate(chunk)
          }
          // 最后一个 chunk 作为最终结果
          const finalData = chunks.length > 0
            ? (chunks[chunks.length - 1] as any)
            : {}
          onSuccess([{
            content: finalData.html || finalData.text || finalData,
            steps: finalData.steps,
          }])
        } else {
          // JSON 响应
          const data = await response.json()
          onSuccess([{
            content: data.html || data.text || data,
            steps: data.steps,
          }])
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          onError(new Error('请求已取消'))
        } else {
          onError(error)
        }
      } finally {
        isLoading.value = false
      }
    },
  })

  // useXChat: 管理消息列表
  // agent 是 ComputedRef<XAgent>，需要用 .value 获取原始 XAgent
  const {
    messages,
    onRequest,
    parsedMessages,
    setMessages,
  } = useXChat({
    agent: toValue(agent) as any,
    requestPlaceholder: {
      content: 'AI 正在思考...',
      role: 'ai',
      status: 'loading',
    } as any,
  })

  // 将 parsedMessages 转换为 BubbleList 兼容格式
  const bubbleItems = computed<ChatMessage[]>(() =>
    parsedMessages.value.map((m: any) => ({
      id: m.id?.toString() || '',
      role: (m.status === 'local' ? 'user' : 'ai') as 'ai' | 'user',
      content: typeof m.message === 'string' ? m.message : (m.message?.content || ''),
      html: typeof m.message === 'object' ? m.message?.html : undefined,
      steps: typeof m.message === 'object' ? m.message?.steps : undefined,
      status: m.status as MessageStatus,
    })),
  )

  /** 清空对话 */
  function clearMessages() {
    setMessages([])
  }

  /** 发送消息 */
  function sendMessage(text: string) {
    if (!text.trim()) return
    onRequest(text)
  }

  return {
    bubbleItems,
    isLoading,
    onRequest,
    sendMessage,
    clearMessages,
    setMessages,
  }
}
