<!-- frontend/src/views/LoginView.vue -->
<template>
  <div class="login-container">
    <a-card class="login-card" :bordered="false">
      <!-- Logo -->
      <div class="login-header">
        <img
          class="logo"
          src="https://mdn.alipayobjects.com/huamei_iwk9zp/afts/img/A*s5sNRo5LjfQAAAAAAAAAAAAADgCCAQ/fmt.webp"
          alt="SAP AI助手"
        />
        <a-typography-title :level="2" class="login-title">比克SAP AI助手</a-typography-title>
      </div>

      <!-- 表单 -->
      <a-form
        :model="form"
        layout="vertical"
        autocomplete="off"
        @finish="handleLogin"
        class="login-form"
      >
        <a-form-item
          label="SAP 账号"
          name="username"
          :rules="[{ required: true, message: '请输入 SAP 账号' }]"
        >
          <a-input
            v-model:value="form.username"
            size="large"
            placeholder="请输入 SAP 用户名"
            autocomplete="username"
          >
            <template #prefix>
              <UserOutlined />
            </template>
          </a-input>
        </a-form-item>

        <a-form-item
          label="密码"
          name="password"
          :rules="[{ required: true, message: '请输入 SAP 密码' }]"
        >
          <a-input-password
            v-model:value="form.password"
            size="large"
            placeholder="请输入 SAP 密码"
            autocomplete="current-password"
          >
            <template #prefix>
              <LockOutlined />
            </template>
          </a-input-password>
        </a-form-item>

        <a-form-item
          label="验证码"
          name="captchaCode"
          :rules="[
            { required: true, message: '请输入验证码' },
            { len: 4, message: '验证码为 4 位' },
          ]"
        >
          <a-flex gap="small" align="center" class="captcha-row">
            <a-input
              v-model:value="form.captchaCode"
              size="large"
              placeholder="请输入验证码"
              :maxlength="4"
              autocomplete="off"
              class="captcha-input"
              @press-enter="handleLogin"
            >
              <template #prefix>
                <SafetyOutlined />
              </template>
            </a-input>
            <a-tooltip title="看不清？点击刷新">
              <a-button
                class="captcha-image-btn"
                size="large"
                :loading="captchaLoading"
                @click="refreshCaptcha"
              >
                <img
                  v-if="captchaImage"
                  :src="captchaImage"
                  alt="验证码"
                  class="captcha-image"
                />
                <span v-else>加载中</span>
              </a-button>
            </a-tooltip>
          </a-flex>
        </a-form-item>

        <a-alert
          v-if="errorMessage"
          :message="errorMessage"
          type="error"
          show-icon
          closable
          class="error-alert"
          @close="errorMessage = ''"
        />

        <a-form-item class="login-btn-item">
          <a-button
            type="primary"
            html-type="submit"
            size="large"
            block
            :loading="isLoading"
            :disabled="!canSubmit"
          >
            登 录
          </a-button>
        </a-form-item>
      </a-form>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import {
  LockOutlined,
  SafetyOutlined,
  UserOutlined,
} from "@ant-design/icons-vue";

const router = useRouter();
const authStore = useAuthStore();

const form = reactive({
  username: "",
  password: "",
  captchaId: "",
  captchaCode: "",
});
const isLoading = ref(false);
const captchaLoading = ref(false);
const captchaImage = ref("");
const errorMessage = ref("");

const canSubmit = computed(
  () =>
    !!form.username &&
    !!form.password &&
    !!form.captchaId &&
    form.captchaCode.trim().length === 4,
);

async function refreshCaptcha() {
  captchaLoading.value = true;
  try {
    const res = await fetch("/api/auth/captcha");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      errorMessage.value = data.error || "验证码加载失败";
      return;
    }
    form.captchaId = data.captchaId || "";
    captchaImage.value = data.image || "";
    form.captchaCode = "";
  } catch (e: any) {
    errorMessage.value = e?.message || "验证码加载失败";
  } finally {
    captchaLoading.value = false;
  }
}

async function handleLogin() {
  errorMessage.value = "";
  isLoading.value = true;

  const result = await authStore.login(form);

  if (result.success) {
    router.push("/");
  } else {
    errorMessage.value = result.error || "登录失败，请重试";
    await refreshCaptcha();
  }

  isLoading.value = false;
}

onMounted(() => {
  refreshCaptcha();
});
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #e6f4ff 0%, #f5f5f5 100%);
  padding: var(--spacing-xl);
}

.login-card {
  width: 100%;
  max-width: 420px;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.login-card :deep(.ant-card-body) {
  padding: 40px 36px;
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.login-header .logo {
  width: 64px;
  height: 64px;
  display: block;
  margin: 0 auto 8px;
  object-fit: contain;
}

.login-title {
  margin: 0 !important;
  color: var(--color-text) !important;
}

.login-form {
  display: flex;
  flex-direction: column;
}

.login-form :deep(.ant-form-item) {
  margin-bottom: 20px;
}

.captcha-row {
  width: 100%;
}

.captcha-input {
  flex: 1;
  min-width: 0;
}

.captcha-image-btn {
  width: 128px;
  height: 40px;
  padding: 0;
  overflow: hidden;
  flex-shrink: 0;
}

.captcha-image {
  display: block;
  width: 120px;
  height: 40px;
  object-fit: cover;
}

.error-alert {
  margin-bottom: 16px;
}

.login-btn-item {
  margin-top: 4px;
  margin-bottom: 0 !important;
}
</style>
