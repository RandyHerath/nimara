import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { cwd, env } from 'node:process'
import { pathToFileURL } from 'node:url'

import VueI18n from '@intlify/unplugin-vue-i18n/vite'
import Vue from '@vitejs/plugin-vue'
import Unocss from 'unocss/vite'
import Info from 'unplugin-info/vite'
import VueMacros from 'unplugin-vue-macros/vite'
import VueRouter from 'unplugin-vue-router/vite'
import Yaml from 'unplugin-yaml/vite'
import VueDevTools from 'vite-plugin-vue-devtools'
import Layouts from 'vite-plugin-vue-layouts'

import { templateCompilerOptions } from '@tresjs/core'
import { LFS, SpaceCard } from 'hfup/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

type PluginFactory = (...args: any[]) => {
  name: string
  [key: string]: unknown
}

const fallbackMap: Record<string, string> = {
  '@proj-airi/unplugin-fetch/vite': resolve(import.meta.dirname, '..', '..', 'packages', 'unplugin-fetch', 'dist', 'vite', 'index.mjs'),
  '@proj-airi/unplugin-live2d-sdk/vite': resolve(import.meta.dirname, '..', '..', 'packages', 'unplugin-live2d-sdk', 'dist', 'vite', 'index.mjs'),
}

async function loadOptionalPlugin(
  moduleSpecifier: string,
  exportName: string,
): Promise<PluginFactory> {
  const candidates = [
    moduleSpecifier,
    ...(fallbackMap[moduleSpecifier] ? [pathToFileURL(fallbackMap[moduleSpecifier]).href] : []),
  ]

  let lastError: unknown

  try {
    for (const candidate of candidates) {
      try {
        const mod = await import(candidate) as Record<string, unknown>
        const resolver = mod[exportName]
        if (typeof resolver === 'function')
          return resolver as PluginFactory
        lastError = new Error(`Export "${exportName}" is not a function on module "${candidate}".`)
      }
      catch (error) {
        lastError = error
      }
    }

    throw lastError ?? new Error('Unknown plugin resolution error.')
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(`[stage-web] Optional plugin "${moduleSpecifier}" unavailable (${reason}). Continuing without it.`)

    return (() => ({
      name: `noop:${moduleSpecifier}`,
    })) as PluginFactory
  }
}

const Download = await loadOptionalPlugin('@proj-airi/unplugin-fetch/vite', 'Download')
const DownloadLive2DSDK = await loadOptionalPlugin('@proj-airi/unplugin-live2d-sdk/vite', 'DownloadLive2DSDK')

const workspaceRoot = resolve(join(import.meta.dirname, '..', '..'))
const localModulePath = (relative: string) => resolve(join(workspaceRoot, relative))

const drizzleDistPath = localModulePath('packages/drizzle-duckdb-wasm/dist/index.mjs')
const drizzleBundlePath = localModulePath('packages/drizzle-duckdb-wasm/dist/bundles/import-url-browser.mjs')

const extraAliases: Record<string, string> = {}

if (existsSync(drizzleDistPath))
  extraAliases['@proj-airi/drizzle-duckdb-wasm'] = drizzleDistPath

if (existsSync(drizzleBundlePath))
  extraAliases['@proj-airi/drizzle-duckdb-wasm/bundles/import-url-browser'] = drizzleBundlePath

export default defineConfig({
  optimizeDeps: {
    exclude: [
      // Internal Packages
      '@proj-airi/stage-ui/*',
      '@proj-airi/drizzle-duckdb-wasm',
      '@proj-airi/drizzle-duckdb-wasm/*',

      // Static Assets: Models, Images, etc.
      'public/assets/*',

      // Live2D SDK
      '@framework/live2dcubismframework',
      '@framework/math/cubismmatrix44',
      '@framework/type/csmvector',
      '@framework/math/cubismviewmatrix',
      '@framework/cubismdefaultparameterid',
      '@framework/cubismmodelsettingjson',
      '@framework/effect/cubismbreath',
      '@framework/effect/cubismeyeblink',
      '@framework/model/cubismusermodel',
      '@framework/motion/acubismmotion',
      '@framework/motion/cubismmotionqueuemanager',
      '@framework/type/csmmap',
      '@framework/utils/cubismdebug',
      '@framework/model/cubismmoc',
    ],
  },
  resolve: {
    alias: {
      '@proj-airi/server-sdk': resolve(join(import.meta.dirname, '..', '..', 'packages', 'server-sdk', 'src')),
      '@proj-airi/i18n': resolve(join(import.meta.dirname, '..', '..', 'packages', 'i18n', 'src')),
      '@proj-airi/stage-ui': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src')),
      '@proj-airi/stage-pages': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-pages', 'src')),
      '@proj-airi/stage-shared': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-shared', 'src')),
      ...extraAliases,
    },
  },
  server: {
    warmup: {
      clientFiles: [
        `${resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src'))}/*.vue`,
        `${resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-pages', 'src'))}/*.vue`,
      ],
    },
  },
  plugins: [
    Info(),

    Yaml(),

    VueMacros({
      plugins: {
        vue: Vue({
          include: [/\.vue$/, /\.md$/],
          ...templateCompilerOptions,
        }),
        vueJsx: false,
      },
      betterDefine: false,
    }),

    // https://github.com/posva/unplugin-vue-router
    VueRouter({
      extensions: ['.vue', '.md'],
      dts: resolve(import.meta.dirname, 'src/typed-router.d.ts'),
      importMode: 'async',
      routesFolder: [
        resolve(import.meta.dirname, 'src', 'pages'),
        resolve(import.meta.dirname, '..', '..', 'packages', 'stage-pages', 'src', 'pages'),
      ],
    }),

    // https://github.com/JohnCampionJr/vite-plugin-vue-layouts
    Layouts(),

    // https://github.com/antfu/unocss
    // see uno.config.ts for config
    Unocss(),

    // https://github.com/antfu/vite-plugin-pwa
    ...(env.TARGET_HUGGINGFACE_SPACE
      ? []
      : [VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
          manifest: {
            name: 'NIMARA',
            short_name: 'NIMARA',
            icons: [
              {
                purpose: 'maskable',
                sizes: '192x192',
                src: '/maskable_icon_x192.png',
                type: 'image/png',
              },
              {
                purpose: 'maskable',
                sizes: '512x512',
                src: '/maskable_icon_x512.png',
                type: 'image/png',
              },
              {
                src: '/web-app-manifest-192x192.png',
                sizes: '192x192',
                type: 'image/png',
              },
              {
                src: '/web-app-manifest-512x512.png',
                sizes: '512x512',
                type: 'image/png',
              },
            ],
          },
          workbox: {
            maximumFileSizeToCacheInBytes: 64 * 1024 * 1024,
            navigateFallbackDenylist: [
              /^\/docs\//,
              /^\/ui\//,
              /^\/remote-assets\//,
              /^\/api\//,
            ],
          },
        })]),

    // https://github.com/intlify/bundle-tools/tree/main/packages/unplugin-vue-i18n
    VueI18n({
      runtimeOnly: true,
      compositionOnly: true,
      fullInstall: true,
    }),

    // https://github.com/webfansplz/vite-plugin-vue-devtools
    VueDevTools(),

    DownloadLive2DSDK(),
    Download('https://dist.ayaka.moe/live2d-models/hiyori_free_zh.zip', 'hiyori_free_zh.zip', 'assets/live2d/models'),
    Download('https://dist.ayaka.moe/live2d-models/hiyori_pro_zh.zip', 'hiyori_pro_zh.zip', 'assets/live2d/models'),
    Download('https://dist.ayaka.moe/vrm-models/VRoid-Hub/AvatarSample-A/AvatarSample_A.vrm', 'AvatarSample_A.vrm', 'assets/vrm/models/AvatarSample-A'),
    Download('https://dist.ayaka.moe/vrm-models/VRoid-Hub/AvatarSample-B/AvatarSample_B.vrm', 'AvatarSample_B.vrm', 'assets/vrm/models/AvatarSample-B'),

    // HuggingFace Spaces
    LFS({ root: cwd(), extraGlobs: ['*.vrm', '*.vrma', '*.hdr', '*.cmo3', '*.png', '*.jpg', '*.jpeg', '*.gif', '*.webp', '*.bmp', '*.ttf'] }),
    SpaceCard({
      root: cwd(),
      title: 'NIMARA: Virtual Companion',
      emoji: '🧸',
      colorFrom: 'pink',
      colorTo: 'pink',
      sdk: 'static',
      pinned: false,
      license: 'mit',
      models: [
        'onnx-community/whisper-base',
        'onnx-community/silero-vad',
      ],
      short_description: 'AI driven VTuber & Companion, supports Live2D and VRM.',
    }),
  ],
})
