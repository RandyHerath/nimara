# @proj-nimara/server-sdk

The SDK for cliet-side code to connect to the server-side components.

## Usage

```shell
ni @proj-nimara/server-sdk -D # from @antfu/ni, can be installed via `npm i -g @antfu/ni`
pnpm i @proj-nimara/server-sdk -D
yarn i @proj-nimara/server-sdk -D
npm i @proj-nimara/server-sdk -D
```

```typescript
import { Client } from '@proj-nimara/server-sdk'

const c = new Client({ name: 'your nimara plugin' })
```

## License

[MIT](../../LICENSE)
