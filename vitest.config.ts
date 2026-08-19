import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 排除 dist/ 下的旧构建产物，避免编译后的过期测试被重复收集执行
    exclude: ["dist/**", "node_modules/**"],
  },
});
