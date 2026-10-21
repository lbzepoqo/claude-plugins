declare module 'claude-code' {
  interface PluginState {
    'memory-hints': {
      // The session's auto-memory folder, '' until the context breakdown names it.
      folder: string
      // Notes already hinted this session, by path.
      hinted: string[]
    }
  }
}
