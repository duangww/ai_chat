<!-- frontend/src/components/chat/ChatInput.vue -->
<template>
  <div class="chat-input">
    <Sender
      v-model:value="inputText"
      :disabled="disabled"
      :placeholder="placeholder"
      :loading="loading"
      @submit="handleSend"
      class="sender-wrapper"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Sender } from "ant-design-x-vue";

const props = defineProps<{
  disabled?: boolean;
  placeholder?: string;
  loading?: boolean;
}>();

const emit = defineEmits<{
  send: [text: string];
}>();

const inputText = ref("");

function handleSend(value: string) {
  const text = value.trim();
  if (!text || props.disabled) return;
  emit("send", text);
  // 清空输入框
  inputText.value = "";
}
</script>

<style scoped>
.chat-input {
  padding: var(--spacing-lg) var(--spacing-xxl);
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-white);
  flex-shrink: 0;
}

.sender-wrapper {
  width: 100%;
}
</style>
