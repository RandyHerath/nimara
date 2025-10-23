import { Buffer } from 'node:buffer'
import { createWriteStream, mkdirSync } from 'node:fs'
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
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
import { createLogger, defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fromBuffer } from 'yauzl'

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
    console.warn(`[stage-web] Optional plugin "${moduleSpecifier}" unavailable (${reason}). Using lightweight fallback implementation.`)

    return createFallbackPlugin(moduleSpecifier) as PluginFactory
  }
}

const Download = await loadOptionalPlugin('@proj-airi/unplugin-fetch/vite', 'Download')
const DownloadLive2DSDK = await loadOptionalPlugin('@proj-airi/unplugin-live2d-sdk/vite', 'DownloadLive2DSDK')

function createFallbackPlugin(moduleSpecifier: string): PluginFactory {
  if (moduleSpecifier === '@proj-airi/unplugin-fetch/vite') {
    return (url: string, filename: string, destination: string) => ({
      name: `fallback-download:${filename}`,
      async configResolved(config) {
        const logger = createLogger()
        const cacheDir = resolve(config.root, '.cache')
        const publicDir = resolve(config.root, 'public')
        const cachePath = resolve(cacheDir, destination, filename)
        const publicPath = resolve(publicDir, destination, filename)

        if (!await pathExists(cachePath)) {
          logger.info(`[fallback] Downloading ${filename} from ${url}...`)
          const response = await fetch(url)
          if (!response.ok)
            throw new Error(`Failed to download "${url}" (${response.status} ${response.statusText})`)
          const buffer = Buffer.from(await response.arrayBuffer())
          await mkdir(dirname(cachePath), { recursive: true })
          await writeFile(cachePath, buffer)
        }

        if (!await pathExists(publicPath)) {
          await mkdir(dirname(publicPath), { recursive: true })
          await copyFile(cachePath, publicPath)
        }
      },
    })
  }

  if (moduleSpecifier === '@proj-airi/unplugin-live2d-sdk/vite') {
    return (options?: { from?: string }) => ({
      name: 'fallback-download-live2d-sdk',
      async configResolved(config) {
        const logger = createLogger()
        const from = options?.from ?? 'https://cubism.live2d.com/sdk-web/bin/CubismSdkForWeb-5-r.3.zip'
        const cacheDir = resolve(config.root, '.cache')
        const publicDir = resolve(config.root, 'public')
        const cacheRoot = resolve(cacheDir, 'assets', 'js', 'CubismSdkForWeb-5-r.3')
        const publicRoot = resolve(publicDir, 'assets', 'js', 'CubismSdkForWeb-5-r.3')
        const cacheFile = resolve(cacheRoot, 'Core', 'live2dcubismcore.min.js')
        const publicFile = resolve(publicRoot, 'Core', 'live2dcubismcore.min.js')

        if (!await pathExists(cacheFile)) {
          logger.info('[fallback] Downloading Live2D Cubism SDK...')
          const response = await fetch(from)
          if (!response.ok)
            throw new Error(`Failed to download Live2D SDK from "${from}" (${response.status} ${response.statusText})`)
          const buffer = Buffer.from(await response.arrayBuffer())
          await unzipTo(buffer, resolve(cacheDir, 'assets', 'js'))
        }

        if (!await pathExists(publicFile)) {
          await mkdir(resolve(publicRoot, 'Core'), { recursive: true })
          await copyFile(cacheFile, publicFile)
        }
      },
    })
  }

  return (() => ({
    name: `noop:${moduleSpecifier}`,
  })) as PluginFactory
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target)
    return true
  }
  catch (error) {
    if (isENOENTError(error))
      return false
    throw error
  }
}

function isENOENTError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT')
}

async function unzipTo(buffer: Buffer, destination: string): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    let pending = 0
    let finishedReading = false

    function maybeResolve() {
      if (finishedReading && pending === 0)
        resolvePromise()
    }

    fromBuffer(buffer, { lazyEntries: true }, (err, zipFile) => {
      if (err) {
        reject(err)
        return
      }
      if (!zipFile) {
        resolvePromise()
        return
      }
      zipFile.readEntry()
      zipFile.on('entry', (entry) => {
        const outputPath = resolve(destination, entry.fileName)
        if (entry.fileName.endsWith('/')) {
          mkdirSync(outputPath, { recursive: true })
          zipFile.readEntry()
          return
        }

        mkdirSync(dirname(outputPath), { recursive: true })
        pending++
        zipFile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr || !readStream) {
            pending--
            zipFile.close()
            reject(streamErr || new Error('Failed to read zip entry stream.'))
            return
          }

          const fileStream = createWriteStream(outputPath)
          readStream.pipe(fileStream)
          fileStream.on('error', (writeErr) => {
            pending--
            zipFile.close()
            reject(writeErr)
          })
          fileStream.on('finish', () => {
            pending--
            maybeResolve()
            zipFile.readEntry()
          })
        })
      })

      zipFile.on('end', () => {
        finishedReading = true
        maybeResolve()
      })

      zipFile.on('error', (zipErr) => {
        zipFile.close()
        reject(zipErr)
      })
    })
  })
}

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
