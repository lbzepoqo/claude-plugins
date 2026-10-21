// The person's recent requests in one session, newest last.
export type PromptHistory = { sessionId: string | null; prompts: string[] }

declare module 'claude-code' {
  interface PluginState {
    'topic-nudge': {
      history: PromptHistory
    }
  }
}
