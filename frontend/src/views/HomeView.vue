<!-- frontend/src/views/HomeView.vue -->
<template>
  <div class="home-container">
    <ChatContainer
      :user-name="authStore.user?.name || authStore.user?.username"
      @logout="handleLogout"
    />
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import ChatContainer from "@/components/chat/ChatContainer.vue";

const router = useRouter();
const authStore = useAuthStore();

function handleLogout() {
  authStore.logout();
  router.push("/login");
}
</script>

<style scoped>
.home-container {
  height: 100vh;
}
</style>
