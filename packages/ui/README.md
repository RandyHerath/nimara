# @proj-nimara/ui

A stylized UI component library built with [Reka UI](https://reka-ui.com/).

To preview the components, refer to the [`stage-ui`](../stage-ui) package for instructions for running the Histoire UI storyboard.

## Usage

```shell
ni @proj-nimara/ui -D # from @antfu/ni, can be installed via `npm i -g @antfu/ni`
pnpm i @proj-nimara/ui -D
yarn i @proj-nimara/ui -D
npm i @proj-nimara/ui -D
```

```vue
<script setup lang="ts">
import { Button } from '@proj-nimara/ui'
</script>

<template>
  <Button>Click me</Button>
</template>
```

## Components

* [Animations](src/components/Animations)
    * [TransitionVertical](src/components/Animations/TransitionVertical.vue)
* [Form](src/components/Form)
    * [Checkbox](src/components/Form/Checkbox)
    * [Field](src/components/Form/Field)
    * [Input](src/components/Form/Input)
    * [Radio](src/components/Form/Radio)
    * [Range](src/components/Form/Range)
    * [Select](src/components/Form/Select)
    * [Textarea](src/components/Form/Textarea)

## License

[MIT](../../LICENSE)
