<!-- frontend/src/App.vue -->
<template>
  <a-config-provider :theme="themeConfig">
    <router-view />
  </a-config-provider>
</template>

<script setup lang="ts">
import { theme } from "ant-design-vue";
import { useAuthStore } from "@/stores/auth";

// 使用 Ant Design 内置亮色主题（light）
const themeConfig = {
  algorithm: theme.defaultAlgorithm,
};

// 初始化时检查登录状态
const authStore = useAuthStore();
authStore.checkAuth();
</script>
