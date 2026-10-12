import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'release',
    '.shots',
    // shadcn/ui 的脚手架组件：整套搬进来备用，但当前界面一个都没用到
    // （应用自己的组件在 src/components/*.tsx）。它们是第三方生成代码，
    // 不该让它的 lint 噪音淹没我们自己代码的问题。
    'src/components/ui/**',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // 状态仓库 / 通用小部件这类模块会同时导出组件与常量、类型、工具函数，
    // react-refresh 的「只导出组件」规则在这里属于误报，关掉以免掩盖真问题。
    files: ['src/store/**/*.{ts,tsx}', 'src/components/Panel.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
