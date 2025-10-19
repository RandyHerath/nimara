import type { BotOptions } from 'mineflayer'

import { env } from 'node:process'

import { useLogger } from '../utils/logger'

const logger = useLogger()

// Configuration interfaces
interface OpenAIConfig {
  apiKey: string
  baseUrl: string
  model: string
  reasoningModel: string
}

interface NimaraConfig {
  wsBaseUrl: string
  clientName: string
}

interface Config {
  openai: OpenAIConfig
  bot: BotOptions
  nimara: NimaraConfig
}

// Helper functions for type-safe environment variable parsing
function getEnvVar(key: string, defaultValue: string): string {
  return env[key] || defaultValue
}

function getEnvNumber(key: string, defaultValue: number): number {
  return Number.parseInt(env[key] || String(defaultValue))
}

// Default configurations
const defaultConfig: Config = {
  openai: {
    apiKey: '',
    baseUrl: '',
    model: '',
    reasoningModel: '',
  },
  bot: {
    username: 'nimara-bot',
    host: 'localhost',
    port: 25565,
    password: '',
    version: '1.20',
  },
  nimara: {
    wsBaseUrl: 'ws://localhost:6121/ws',
    clientName: 'minecraft-bot',
  },
}

// Create a singleton config instance
export const config: Config = { ...defaultConfig }

// Initialize environment configuration
export function initEnv(): void {
  logger.log('Initializing environment variables')

  // Update config with environment variables
  config.openai = {
    apiKey: getEnvVar('OPENAI_API_KEY', defaultConfig.openai.apiKey),
    baseUrl: getEnvVar('OPENAI_API_BASEURL', defaultConfig.openai.baseUrl),
    model: getEnvVar('OPENAI_MODEL', defaultConfig.openai.model),
    reasoningModel: getEnvVar('OPENAI_REASONING_MODEL', defaultConfig.openai.reasoningModel),
  }

  config.bot = {
    username: getEnvVar('BOT_USERNAME', defaultConfig.bot.username as string),
    host: getEnvVar('BOT_HOSTNAME', defaultConfig.bot.host as string),
    port: getEnvNumber('BOT_PORT', defaultConfig.bot.port as number),
    password: getEnvVar('BOT_PASSWORD', defaultConfig.bot.password as string),
    version: getEnvVar('BOT_VERSION', defaultConfig.bot.version as string),
  }

  config.nimara = {
    wsBaseUrl: getEnvVar('NIMARA_WS_BASEURL', defaultConfig.nimara.wsBaseUrl),
    clientName: getEnvVar('NIMARA_CLIENT_NAME', defaultConfig.nimara.clientName),
  }

  logger.withFields({ config }).log('Environment variables initialized')
}
