import { defineConfig } from 'vitest/config'

const isCi = Boolean(process.env.CI)

export default defineConfig({
  test: {
    reporters: isCi
      ? ['default', ['junit', { addFileAttribute: true }]]
      : ['default'],
    outputFile: isCi ? { junit: 'reports/junit.xml' } : undefined,
  },
})
