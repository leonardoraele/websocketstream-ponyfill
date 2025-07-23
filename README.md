# WebSocketStream Ponyfill

[![NPM Version](https://img.shields.io/npm/v/websocketstream-ponyfill)](https://www.npmjs.com/package/websocketstream-ponyfill)

An implementation of [`WebSocketStream`](https://developer.mozilla.org/en-US/docs/Web/API/WebSocketStream)
provided as a [ponyfill](ponyfill.com).

```ts
import { WebSocketStream } from 'websocketstream-ponyfill';

const { readable, writable } = await new WebSocketStream('ws://localhost:8080').opened;

readable.pipeTo(writable); // Echoes received messages
```

## License

MIT
