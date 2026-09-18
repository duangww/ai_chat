<!-- frontend/src/components/chat/ChatHeader.vue -->
<template>
  <div class="chat-header">
    <a-space class="header-actions" :size="4">
      <a-button
        class="clear-btn"
        size="small"
        :disabled="disabled"
        @click="emit('clear')"
      >
        <template #icon>
          <DeleteOutlined />
        </template>
        <span class="btn-label">清空</span>
      </a-button>

      <a-divider type="vertical" class="header-divider" />

      <a-avatar :size="28" :style="{ background: 'var(--color-primary)', flexShrink: 0 }">
        {{ avatarText }}
      </a-avatar>
      <a-typography-text strong class="user-name" :ellipsis="true">
        {{ displayName }}
      </a-typography-text>
      <a-button type="text" size="small" class="logout-btn" @click="emit('logout')">
        <template #icon>
          <LogoutOutlined />
        </template>
        <span class="btn-label">退出</span>
      </a-button>
    </a-space>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { DeleteOutlined, LogoutOutlined } from "@ant-design/icons-vue";

const props = defineProps<{
  disabled?: boolean;
  title?: string;
  subtitle?: string;
  userName?: string;
}>();

const emit = defineEmits<{
  clear: [];
  logout: [];
}>();

const displayName = computed(() => props.userName || "用户");
const avatarText = computed(() => displayName.value.charAt(0));
</script>

<style scoped>
.chat-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--spacing-sm);
  background: var(--color-bg-white);
  border-bottom: 1px solid var(--color-border);
  padding: var(--spacing-sm) var(--spacing-lg);
  flex-shrink: 0;
  min-width: 0;
}

.header-actions {
  flex-shrink: 0;
}

.user-name {
  max-width: 64px;
}

@media (max-width: 480px) {
  .chat-header {
    padding: var(--spacing-sm) var(--spacing-md);
  }

  .btn-label,
  .user-name,
  .header-divider {
    display: none;
  }

  .clear-btn {
    padding-inline: 6px;
  }

  .logout-btn {
    padding-inline: 4px;
  }
}
</style>
