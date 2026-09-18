// frontend/src/types/auth.ts
export interface LoginForm {
  username: string
  password: string
  captchaId: string
  captchaCode: string
}

export interface McpToolAuth {
  tool: string
  tool_text?: string
}

export interface AuthUser {
  id: string
  username: string
  name?: string
  tools?: McpToolAuth[]
}

export interface LoginResponse {
  token: string
  user: AuthUser
}

export interface AuthState {
  isAuthenticated: boolean
  user: AuthUser | null
  token: string | null
}
