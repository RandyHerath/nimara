import type { ModelInfo, ProviderMetadata } from '../providers'

import { generateText } from '@xsai/generate-text'
import { listModels } from '@xsai/model'
import { message } from '@xsai/utils-chat'

type ProviderCreator = (apiKey: string, baseUrl: string) => any

export function buildOpenAICompatibleProvider(
  options: Partial<ProviderMetadata> & {
    id: string
    name: string
    icon: string
    description: string
    nameKey: string
    descriptionKey: string
    category?: 'chat' | 'embed' | 'speech' | 'transcription'
    tasks?: string[]
    defaultBaseUrl?: string
    creator: ProviderCreator
    capabilities?: ProviderMetadata['capabilities']
    validators?: ProviderMetadata['validators']
    validation?: ('health' | 'model_list' | 'chat_completions')[]
    additionalHeaders?: Record<string, string>
  },
): ProviderMetadata {
  const {
    id,
    name,
    icon,
    description,
    nameKey,
    descriptionKey,
    category,
    tasks,
    defaultBaseUrl,
    creator,
    capabilities,
    validators,
    validation,
    additionalHeaders,
    ...rest
  } = options

  const finalCapabilities = capabilities || {
    listModels: async (config: Record<string, unknown>) => {
      // Safer casting of apiKey/baseUrl (prevents .trim() crash if not a string)
      const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
      const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''

      const provider = await creator(apiKey, baseUrl)
      // Check provider.model exists and is a function
      if (!provider || typeof provider.model !== 'function') {
        return []
      }

      // Previously: fetch(`${baseUrl}models`)
      const models = await listModels({
        apiKey,
        baseURL: baseUrl,
        headers: {
          ...additionalHeaders,
          Authorization: `Bearer ${apiKey}`,
        },
      })

      return models.map((model: any) => {
        return {
          id: model.id,
          name: model.name || model.display_name || model.id,
          provider: id,
          description: model.description || '',
          contextLength: model.context_length || 0,
          deprecated: false,
        } satisfies ModelInfo
      })
    },
  }

  const finalValidators = validators || {
    validateProviderConfig: async (config: Record<string, unknown>) => {
      const errors: Error[] = []
      let baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''
      const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''

      if (!baseUrl) {
        errors.push(new Error('Base URL is required'))
      }

      try {
        if (new URL(baseUrl).host.length === 0) {
          errors.push(new Error('Base URL is not absolute. Check your input.'))
        }
      }
      catch {
        errors.push(new Error('Base URL is invalid. It must be an absolute URL.'))
      }

      // normalize trailing slash instead of rejecting
      if (baseUrl && !baseUrl.endsWith('/')) {
        baseUrl += '/'
      }

      if (errors.length > 0) {
        return {
          errors,
          reason: errors.map(e => e.message).join(', '),
          valid: false,
        }
      }

      const validationChecks = validation || []

      const normalizeModels = (models: unknown): any[] => {
        if (Array.isArray(models))
          return models

        if (models && typeof models === 'object') {
          if (Array.isArray((models as any).data))
            return (models as any).data
          if (Array.isArray((models as any).models))
            return (models as any).models
        }

        return []
      }

      const extractModelId = (model: any): string => {
        if (!model)
          return ''

        if (typeof model === 'string')
          return model

        const candidate = model.id ?? model.name ?? model.model ?? ''
        return typeof candidate === 'string' ? candidate : ''
      }

      const readCapabilities = (model: any): string[] => {
        const values: unknown[] = []
        const tryPush = (value: unknown) => {
          if (value === undefined || value === null)
            return
          if (Array.isArray(value)) {
            values.push(...value)
            return
          }
          if (typeof value === 'string') {
            values.push(value)
            return
          }
          if (typeof value === 'object')
            values.push(...Object.values(value))
        }

        tryPush(model?.capabilities)
        tryPush(model?.capability)
        tryPush(model?.supported_generation_methods ?? model?.supportedGenerationMethods)
        tryPush(model?.supported_methods ?? model?.supportedMethods)
        tryPush(model?.modalities)
        tryPush(model?.output_modalities ?? model?.outputModalities)
        tryPush(model?.tasks)
        tryPush(model?.tags)

        return values
          .filter(value => typeof value === 'string')
          .map(value => value.toLowerCase())
      }

      const isEmbeddingModel = (model: any): boolean => {
        const id = extractModelId(model).toLowerCase()
        const capabilities = readCapabilities(model)
        if (capabilities.some(capability => capability.includes('embed')))
          return true
        return /embed|embedding|similarity|vector|rerank/.test(id)
      }

      const supportsTextGeneration = (model: any): boolean => {
        const id = extractModelId(model).toLowerCase()
        const capabilities = readCapabilities(model)

        if (capabilities.some(capability => {
          return capability.includes('generatecontent')
            || capability.includes('generatetext')
            || capability.includes('generate')
            || capability.includes('chat')
            || capability.includes('respond')
            || capability.includes('completion')
        }))
          return true

        return !isEmbeddingModel(model) && !/embedding|embed|vector|rerank|similarity/.test(id)
      }

      const scoreModel = (model: any): number => {
        const id = extractModelId(model).toLowerCase()
        let score = 0

        if (supportsTextGeneration(model))
          score += 50

        if (!isEmbeddingModel(model))
          score += 20

        // Prefer commonly available chat models
        if (/flash/.test(id))
          score += 15
        if (/flash-8b/.test(id))
          score += 5
        if (/-8b/.test(id) || /mini/.test(id) || /lite/.test(id))
          score += 4
        if (/latest/.test(id))
          score += 2

        // Penalize premium / experimental identifiers that often have zero free quota
        if (/pro/.test(id))
          score -= 6
        if (/exp/.test(id) || /experimental/.test(id))
          score -= 8

        // Additional penalties for obvious embedding / non-chat models
        if (/embedding|embed|similarity|rerank|vector/.test(id))
          score -= 100

        return score
      }

      const selectModelId = (models: any[]): string => {
        if (models.length === 0)
          return 'test'

        const ranked = [...models]
          .map(model => ({ model, score: scoreModel(model) }))
          .sort((a, b) => b.score - a.score)

        const best = ranked.find(entry => extractModelId(entry.model)) ?? ranked[0]
        return extractModelId(best.model) || 'test'
      }

      // Auto-detect first available model for validation
      let model = 'test' // fallback to `test` if fails
      try {
        const rawModels = await listModels({
          apiKey,
          baseURL: baseUrl,
          headers: {
            ...additionalHeaders,
            Authorization: `Bearer ${apiKey}`,
          },
        })
        const modelsArray = normalizeModels(rawModels)
        if (modelsArray.length > 0)
          model = selectModelId(modelsArray)
      }
      catch (e) {
        console.warn(`Model auto-detection failed: ${(e as Error).message}`)
      }

      // Health check = try generating text (was: fetch(`${baseUrl}chat/completions`))
      if (validationChecks.includes('health')) {
        try {
          await generateText({
            apiKey,
            baseURL: baseUrl,
            headers: {
              ...additionalHeaders,
              Authorization: `Bearer ${apiKey}`,
            },
            model,
            messages: message.messages(message.user('ping')),
            max_tokens: 1,
          })
        }
        catch (e) {
          errors.push(new Error(`Health check failed: ${(e as Error).message}`))
        }
      }

      // Model list validation (was: fetch(`${baseUrl}models`))
      if (validationChecks.includes('model_list')) {
        try {
          const models = await listModels({
            apiKey,
            baseURL: baseUrl,
            headers: {
              ...additionalHeaders,
              Authorization: `Bearer ${apiKey}`,
            },
          })
          if (!models || models.length === 0) {
            errors.push(new Error('Model list check failed: no models found'))
          }
        }
        catch (e) {
          errors.push(new Error(`Model list check failed: ${(e as Error).message}`))
        }
      }

      // Chat completions validation = generateText again (was: fetch(`${baseUrl}chat/completions`))
      if (validationChecks.includes('chat_completions')) {
        try {
          await generateText({
            apiKey,
            baseURL: baseUrl,
            headers: {
              ...additionalHeaders,
              Authorization: `Bearer ${apiKey}`,
            },
            model,
            messages: message.messages(message.user('ping')),
            max_tokens: 1,
          })
        }
        catch (e) {
          errors.push(new Error(`Chat completions check failed: ${(e as Error).message}`))
        }
      }

      return {
        errors,
        // Consistent reason string (empty when no errors)
        reason: errors.length > 0 ? errors.map(e => e.message).join(', ') : '',
        valid: errors.length === 0,
      }
    },
  }

  return {
    id,
    category: category || 'chat',
    tasks: tasks || ['text-generation'],
    nameKey,
    name,
    descriptionKey,
    description,
    icon,
    defaultOptions: () => ({
      baseUrl: defaultBaseUrl || '',
    }),
    createProvider: async (config: { apiKey: string, baseUrl: string }) => {
      const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
      let baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''
      if (baseUrl && !baseUrl.endsWith('/')) {
        baseUrl += '/'
      }
      return creator(apiKey, baseUrl)
    },
    capabilities: finalCapabilities,
    validators: finalValidators,
    ...rest,
  } as ProviderMetadata
}
