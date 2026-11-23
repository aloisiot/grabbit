import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Skip agent worktrees (.claude/worktrees/*) and the Rust side.
    exclude: [...configDefaults.exclude, ".claude/**", "src-tauri/**"],
    setupFiles: ["src/test-setup.ts"],
  },
});
