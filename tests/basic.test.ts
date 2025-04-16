import path from 'node:path'
import { describe } from 'vitest'
import { RollupVueJsx, rollupBuild, testFixtures } from '@vue-macros/test-utils'
import VueReactivityFunction from '../src/rollup'

describe('fixtures', async () => {
  await testFixtures(
    ['tests/fixtures/*.tsx'],
    (args, id) => rollupBuild(id, [VueReactivityFunction(), RollupVueJsx()]),
    { cwd: path.resolve(__dirname, '..'), promise: true },
  )
})
