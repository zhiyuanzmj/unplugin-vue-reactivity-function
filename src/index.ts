import { type UnpluginInstance, createUnplugin } from 'unplugin'
import plugin from './raw'
import type { Options } from './core/options'

const unplugin: UnpluginInstance<Options | undefined> = createUnplugin(plugin)
export default unplugin
