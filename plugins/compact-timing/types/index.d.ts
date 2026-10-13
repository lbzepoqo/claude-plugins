declare module 'claude-code' {
  interface PluginState {
    'compact-timing': {
      mark: { state: 'busy' | 'boundary'; focus: string } | null
    }
  }
}
