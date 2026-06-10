import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/lib/wearableActivityPolicy.test.ts',
      'src/lib/wearableActivityCalories.test.ts',
      'src/lib/badgeUnlockTime.test.ts',
      'src/lib/userFacingError.test.ts',
    ],
    globals: false,
  },
});
