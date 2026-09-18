<!-- frontend/src/components/chat/ChatContainer.vue -->
<template>
  <a-layout class="chat-layout">
    <a-layout-content class="chat-content">
      <div class="chat-wrapper">
        <!-- 顶部导航栏 -->
        <ChatHeader
          :disabled="bubbleItems.length <= 1"
          :title="title"
          :subtitle="subtitle"
          :user-name="userName"
          @clear="handleClear"
          @logout="emit('logout')"
        />

        <!-- 欢迎页：无消息时显示 -->
        <div v-if="bubbleItems.length === 0" class="welcome-container">
          <Welcome
            class="welcome-component"
            icon="https://mdn.alipayobjects.com/huamei_iwk9zp/afts/img/A*s5sNRo5LjfQAAAAAAAAAAAAADgCCAQ/fmt.webp"
            :description="welcomeDescription"
          />
          <div class="prompts-wrapper">
            <Prompts
              :items="suggestions"
              :vertical="promptsVertical"
              :wrap="!promptsVertical"
              :styles="promptsStyles"
              :on-item-click="handleSuggestionClick"
            />
          </div>
        </div>

        <!-- 消息气泡列表 -->
        <div v-else class="bubble-list-wrapper">
          <BubbleList
            ref="bubbleListRef"
            :items="bubbleItems"
            :roles="bubbleRoles"
            :auto-scroll="true"
          />
        </div>

        <!-- 底部输入框 -->
        <ChatInput
          :disabled="isLoading"
          :placeholder="'输入消息…'"
          :loading="isLoading"
          @send="handleSend"
        />
      </div>
    </a-layout-content>
  </a-layout>
</template>

<script setup lang="ts">
import { ref, h, computed } from "vue";
import { BubbleList, Welcome, Prompts, ThoughtChain } from "ant-design-x-vue";
import {
  RobotOutlined,
  UserOutlined,
  BulbOutlined,
  InfoCircleOutlined,
  CopyOutlined,
} from "@ant-design/icons-vue";
import { message, Grid } from "ant-design-vue";
import { useChat } from "@/composables/useChat";
import ChatHeader from "./ChatHeader.vue";
import ChatInput from "./ChatInput.vue";
import type { ChatMessage } from "@/composables/useChat";

defineProps<{
  userName?: string;
}>();

const emit = defineEmits<{
  logout: [];
}>();

// 常量
const title = "SAP AI 助手";
const subtitle = "";
const welcomeDescription = "你好！我是SAP AI助手，可以帮你查询 SAP 运营数据。";

// 窄屏竖排建议项（iPhone SE 等）
const screens = Grid.useBreakpoint();
const promptsVertical = computed(() => !screens.value.sm);
const promptsStyles = computed(() =>
  promptsVertical.value
    ? { item: { width: "100%" } }
    : { item: { flex: "1 1 240px", maxWidth: "100%" } },
);

// 建议列表
const suggestions = [
  {
    key: "1",
    icon: h(BulbOutlined, { style: { color: "#FFD700" } }),
    label: "查询1100公司在2025年度的毛利率",
    value: "查询1100公司在2025年度的毛利率和净利润",
  },
  {
    key: "2",
    icon: h(InfoCircleOutlined, { style: { color: "#1890FF" } }),
    label: "查询上季度的资产负债状况",
    value: "查询上季度的资产负债状况",
  },
];

// 聊天状态
const { bubbleItems, isLoading, clearMessages, sendMessage } = useChat();

// 组件引用
const bubbleListRef = ref<InstanceType<typeof BubbleList> | null>(null);

/**
 * BubbleList roles 配置
 * 统一管理 AI 和用户气泡的样式与行为
 */
const bubbleRoles = computed(() => ({
  ai: {
    placement: "start" as const,
    avatar: {
      icon: h(RobotOutlined),
      style: { background: "var(--color-primary-light)", color: "var(--color-primary)" },
    },
    typing: { step: 3, interval: 30 },
    messageRender: (content: string) => {
      // 支持 HTML 渲染
      if (typeof content === "string" && (content.startsWith("<") || content.includes("<br"))) {
        return h("div", { class: "markdown-body", innerHTML: content });
      }
      return h("div", { class: "markdown-body" }, content);
    },
    footer: (ctx: { item: ChatMessage }) => {
      const steps = ctx.item?.steps;
      if (steps && steps.length > 0) {
        return h(ThoughtChain, {
          items: steps.map((s: any, i: number) => ({
            key: `step_${i}`,
            title: s.title || s.step || `步骤 ${i + 1}`,
            description: s.description || s.content || "",
            status: s.status || "success",
            icon: s.icon,
          })),
          collapsible: true,
          size: "small",
          style: { marginTop: "8px" },
        });
      }
      // 复制按钮
      return h("div", { style: { marginTop: "4px" } }, [
        h(
          "span",
          {
            style: { cursor: "pointer", fontSize: "12px", color: "#8c8c8c" },
            onClick: () => {
              const text = ctx.item?.content || "";
              navigator.clipboard
                .writeText(text)
                .then(() => {
                  message.success("已复制到剪贴板");
                })
                .catch(() => {
                  message.error("复制失败");
                });
            },
          },
          [h(CopyOutlined, { style: { marginRight: "4px" } }), "复制"],
        ),
      ]);
    },
  },
  user: {
    placement: "end" as const,
    avatar: {
      icon: h(UserOutlined),
      style: { background: "var(--color-primary)", color: "#ffffff" },
    },
  },
}));

// 事件处理
function handleSend(text: string) {
  sendMessage(text);
}

function handleSuggestionClick(info: { data: any }) {
  const item = info?.data;
  if (item?.value) {
    sendMessage(item.value);
  }
}

function handleClear() {
  clearMessages();
}
</script>

<style scoped>
.chat-layout {
  height: 100vh;
  background: var(--color-bg);
}

.chat-content {
  display: flex;
  justify-content: center;
  align-items: stretch;
  padding: var(--spacing-xl);
}

@media (max-width: 480px) {
  .chat-content {
    padding: 0;
  }

  .chat-wrapper {
    border-radius: 0;
    box-shadow: none;
  }

  .welcome-container {
    padding: 16px 12px;
  }

  .prompts-wrapper {
    margin-top: 24px;
    max-width: 100%;
  }
}

.chat-wrapper {
  width: 100%;
  max-width: var(--chat-max-width);
  background: var(--color-bg-white);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 欢迎页 */
.welcome-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 0;
  padding: 20px;
  box-sizing: border-box;
}

.welcome-component {
  flex: none;
  margin: 0 auto;
  max-width: 500px;
}

.prompts-wrapper {
  margin-top: 40px;
  width: 100%;
  max-width: 600px;
  min-width: 0;
  box-sizing: border-box;
  padding: 0 4px;
}

.prompts-wrapper :deep(.ant-prompts-list) {
  width: 100%;
}

.prompts-wrapper :deep(.ant-prompts-item) {
  box-sizing: border-box;
  min-width: 0;
}

.prompts-wrapper :deep(.ant-prompts-label) {
  word-break: break-word;
  white-space: normal;
}

/* 气泡列表容器 */
.bubble-list-wrapper {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--spacing-xl) var(--spacing-xxl);
  background: #fafbfc;
}

/* Markdown 渲染样式 */
:deep(.markdown-body) {
  font-size: var(--font-size-base);
  line-height: 1.7;
  word-break: break-word;
}

:deep(.markdown-body h1),
:deep(.markdown-body h2),
:deep(.markdown-body h3),
:deep(.markdown-body h4) {
  margin: 12px 0 8px;
  font-weight: 600;
}

:deep(.markdown-body h1) {
  font-size: 1.4em;
}
:deep(.markdown-body h2) {
  font-size: 1.25em;
}
:deep(.markdown-body h3) {
  font-size: 1.1em;
}

:deep(.markdown-body p) {
  margin: 4px 0;
}

:deep(.markdown-body ul),
:deep(.markdown-body ol) {
  padding-left: 20px;
  margin: 4px 0;
}

:deep(.markdown-body table) {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 0.9em;
}

:deep(.markdown-body th),
:deep(.markdown-body td) {
  border: 1px solid #e8e8e8;
  padding: 6px 10px;
  text-align: left;
}

:deep(.markdown-body th) {
  background: #fafafa;
  font-weight: 600;
}

:deep(.markdown-body tr:nth-child(even)) {
  background: #fafbfc;
}

:deep(.markdown-body hr) {
  border: none;
  border-top: 1px solid #eee;
  margin: 12px 0;
}

:deep(.markdown-body code) {
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.9em;
}

:deep(.markdown-body pre) {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
}

:deep(.markdown-body strong) {
  font-weight: 600;
}

:deep(.markdown-body blockquote) {
  border-left: 3px solid var(--color-primary);
  padding-left: 12px;
  margin: 8px 0;
  color: #666;
}
</style>
