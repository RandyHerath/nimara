import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/index.ts',
  ],
  noExternal: [
    '@proj-nimara/font-cjkfonts-allseto',
    '@proj-nimara/font-departure-mono',
    '@proj-nimara/font-xiaolai',
  ],
  dts: true,
  sourcemap: true,
  fixedExtension: true,
})
