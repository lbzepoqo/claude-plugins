// A skill the person or Claude can use, from the session's command list.
export type SkillEntry = { name: string; description: string; origin: string }
// The skill the classifier matched to the latest prompt.
export type SkillHint = { name: string; description: string; request: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    'skill-hints': {
      skills: SkillEntry[]
      hint: SkillHint | null
      filter: string
    }
  }
}
