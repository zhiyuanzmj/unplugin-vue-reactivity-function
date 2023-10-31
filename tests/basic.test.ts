import path from 'node:path'
import { describe } from 'vitest'
import {
  RollupEsbuildPlugin,
  RollupRemoveVueFilePathPlugin,
  RollupVue,
  rollupBuild,
  testFixtures,
} from '@vue-macros/test-utils'
import VueReactivityFunction from '../src/rollup'

describe('fixtures', async () => {
  await testFixtures(
    ['tests/fixtures/*.vue'],
    (args, id) =>
      rollupBuild(id, [
        RollupVue(),
        VueReactivityFunction(),
        RollupRemoveVueFilePathPlugin(),
        RollupEsbuildPlugin({
          target: 'esnext',
        }),
      ]),
    { cwd: path.resolve(__dirname, '..'), promise: true }
  )
})
