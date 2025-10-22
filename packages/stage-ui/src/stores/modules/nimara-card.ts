import type { Card, ccv3 } from '@proj-airi/ccc'

import { useLocalStorage } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import SystemPromptV2 from '../../constants/prompts/system-v2'

import { useConsciousnessStore } from './consciousness'
import { useSpeechStore } from './speech'

export interface NimaraExtension {
  modules: {
    consciousness: {
      model: string // Example: "gpt-4o"
    }

    speech: {
      model: string // Example: "eleven_multilingual_v2"
      voice_id: string // Example: "alloy"

      pitch?: number
      rate?: number
      ssml?: boolean
      language?: string
    }

    vrm?: {
      source?: 'file' | 'url'
      file?: string // Example: "vrm/model.vrm"
      url?: string // Example: "https://example.com/vrm/model.vrm"
    }

    live2d?: {
      source?: 'file' | 'url'
      file?: string // Example: "live2d/model.json"
      url?: string // Example: "https://example.com/live2d/model.json"
    }
  }

  agents: {
    [key: string]: { // example: minecraft
      prompt: string
    }
  }
}

export interface NimaraCard extends Card {
  extensions: {
    nimara: NimaraExtension
  } & Card['extensions']
}

export const useNimaraCardStore = defineStore('nimara-card', () => {
  const cards = useLocalStorage<Map<string, NimaraCard>>('nimara-cards', new Map())
  const activeCardId = useLocalStorage('nimara-card-active-id', 'default')

  const activeCard = computed(() => cards.value.get(activeCardId.value))

  const consciousnessStore = useConsciousnessStore()
  const speechStore = useSpeechStore()

  const {
    activeModel: activeConsciousnessModel,
  } = storeToRefs(consciousnessStore)

  const {
    activeSpeechVoiceId,
    activeSpeechModel,
  } = storeToRefs(speechStore)

  const addCard = (card: NimaraCard | Card | ccv3.CharacterCardV3) => {
    const newCardId = nanoid()
    cards.value.set(newCardId, newNimaraCard(card))
    return newCardId
  }

  const removeCard = (id: string) => {
    cards.value.delete(id)
  }

  const getCard = (id: string) => {
    return cards.value.get(id)
  }

  function resolveNimaraExtension(card: Card | ccv3.CharacterCardV3): NimaraExtension {
    // Get existing extension if available
    const existingExtension = ('data' in card
      ? card.data?.extensions?.nimara
      : card.extensions?.nimara) as NimaraExtension

    // Create default modules config
    const defaultModules = {
      consciousness: {
        model: activeConsciousnessModel.value,
      },
      speech: {
        model: activeSpeechModel.value,
        voice_id: activeSpeechVoiceId.value,
      },
    }

    // Return default if no extension exists
    if (!existingExtension) {
      return {
        modules: defaultModules,
        agents: {},
      }
    }

    // Merge existing extension with defaults
    return {
      modules: {
        consciousness: {
          model: existingExtension.modules?.consciousness?.model ?? defaultModules.consciousness.model,
        },
        speech: {
          model: existingExtension.modules?.speech?.model ?? defaultModules.speech.model,
          voice_id: existingExtension.modules?.speech?.voice_id ?? defaultModules.speech.voice_id,
          pitch: existingExtension.modules?.speech?.pitch,
          rate: existingExtension.modules?.speech?.rate,
          ssml: existingExtension.modules?.speech?.ssml,
          language: existingExtension.modules?.speech?.language,
        },
        vrm: existingExtension.modules?.vrm,
        live2d: existingExtension.modules?.live2d,
      },
      agents: existingExtension.agents ?? {},
    }
  }

  function newNimaraCard(card: Card | ccv3.CharacterCardV3): NimaraCard {
    // Handle ccv3 format if needed
    if ('data' in card) {
      const ccv3Card = card as ccv3.CharacterCardV3
      return {
        name: ccv3Card.data.name,
        version: ccv3Card.data.character_version ?? '1.0.0',
        description: ccv3Card.data.description ?? '',
        creator: ccv3Card.data.creator ?? '',
        notes: ccv3Card.data.creator_notes ?? '',
        notesMultilingual: ccv3Card.data.creator_notes_multilingual,
        personality: ccv3Card.data.personality ?? '',
        scenario: ccv3Card.data.scenario ?? '',
        greetings: [
          ccv3Card.data.first_mes,
          ...(ccv3Card.data.alternate_greetings ?? []),
        ],
        greetingsGroupOnly: ccv3Card.data.group_only_greetings ?? [],
        systemPrompt: ccv3Card.data.system_prompt ?? '',
        postHistoryInstructions: ccv3Card.data.post_history_instructions ?? '',
        messageExample: ccv3Card.data.mes_example
          ? ccv3Card.data.mes_example
              .split('<START>\n')
              .filter(Boolean)
              .map(example => example.split('\n')
                .map((line) => {
                  if (line.startsWith('{{char}}:') || line.startsWith('{{user}}:'))
                    return line as `{{char}}: ${string}` | `{{user}}: ${string}`
                  throw new Error(`Invalid message example format: ${line}`)
                }))
          : [],
        tags: ccv3Card.data.tags ?? [],
        extensions: {
          nimara: resolveNimaraExtension(ccv3Card),
          ...ccv3Card.data.extensions,
        },
      }
    }

    return {
      ...card,
      extensions: {
        nimara: resolveNimaraExtension(card),
        ...card.extensions,
      },
    }
  }

  onMounted(() => {
    const { t } = useI18n()

    cards.value.set('default', newNimaraCard({
      name: 'ReLU',
      version: '1.0.0',
      // description: 'ReLU is a simple and effective activation function that is used in many neural networks.',
      description: SystemPromptV2(
        t('base.prompt.prefix'),
        t('base.prompt.suffix'),
      ).content,
    }))
  })

  watch(activeCard, (newCard: NimaraCard | undefined) => {
    if (!newCard)
      return

    // TODO: live2d, vrm
    // TODO: Minecraft Agent, etc
    const extension = resolveNimaraExtension(newCard)
    if (!extension)
      return

    activeConsciousnessModel.value = extension?.modules?.consciousness?.model
    activeSpeechModel.value = extension?.modules?.speech?.model
    activeSpeechVoiceId.value = extension?.modules?.speech?.voice_id
  })

  return {
    cards,
    activeCard,
    activeCardId,
    addCard,
    removeCard,
    getCard,

    currentModels: computed(() => {
      return {
        consciousness: {
          model: activeConsciousnessModel.value,
        },
        speech: {
          model: activeSpeechModel.value,
          voice_id: activeSpeechVoiceId.value,
        },
      } satisfies NimaraExtension['modules']
    }),

    systemPrompt: computed(() => {
      const card = activeCard.value
      if (!card)
        return ''

      const components = [
        card.systemPrompt,
        card.description,
        card.personality,
      ].filter(Boolean)

      return components.join('\n')
    }),
  }
})
