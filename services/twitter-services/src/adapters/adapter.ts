import type { Config } from '../config/types'
import type { Context } from '../core/browser/context'
import type { NimaraAdapter } from './nimara-adapter'
import type { MCPAdapter } from './mcp-adapter'

import { logger } from '../utils/logger'

export function useAdapter() {
  const adapters: { nimara?: NimaraAdapter, mcp?: MCPAdapter } = {}

  async function initAdapters(config: Config, ctx: Context): Promise<{ nimara?: NimaraAdapter, mcp?: MCPAdapter }> {
    if (config.adapters.nimara?.enabled) {
      logger.main.log('Starting Nimara adapter...')
      const { NimaraAdapter } = await import('./nimara-adapter')

      adapters.nimara = new NimaraAdapter(ctx, {
        url: config.adapters.nimara.url,
        token: config.adapters.nimara.token,
        credentials: config.credentials || {},
      })

      await adapters.nimara.start()
      logger.main.log('Nimara adapter started')
    }

    if (config.adapters.mcp?.enabled) {
      logger.main.log('Starting MCP adapter...')
      const { MCPAdapter } = await import('./mcp-adapter')

      adapters.mcp = new MCPAdapter(config.adapters.mcp.port, ctx)

      await adapters.mcp.start()
      logger.main.log('MCP adapter started')
    }

    return adapters
  }

  return {
    adapters,
    initAdapters,
  }
}
