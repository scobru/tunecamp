1. **Fix `AdminReleaseEditor.tsx`**: Update the URL using `window.history.replaceState` or React Router's `navigate(..., { replace: true })` after saving a new release so `isNew` won't incorrectly stay true.
2. **Pre-commit checks**: Run `pre_commit_instructions` and follow steps for code verification, testing, and formatting.
3. **Submit**: Create PR.
