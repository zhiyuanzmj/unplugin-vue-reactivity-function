import path from 'node:path'
import { rollupBuild, RollupVueJsx, testFixtures } from '@vue-macros/test-utils'
import { describe } from 'vitest'
import VueReactivityFunction from '../dist/rollup'

describe('fixtures', async () => {
  await testFixtures(
    ['tests/fixtures/*.tsx'],
    (args, id) => rollupBuild(id, [VueReactivityFunction(), RollupVueJsx()]),
    { cwd: path.resolve(__dirname, '..'), promise: true },
  )
})
