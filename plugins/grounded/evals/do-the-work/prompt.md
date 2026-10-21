---
max_turns: 3
allowed_tools: []
---

Why does this return undefined for some users?

```js
function displayName(user) {
  if (user.profile) {
    return user.profile.nickname || user.profile.fullName;
  }
}
```

Users created through the API have no `profile` object.
