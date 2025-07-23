export type WebSocketSendType = string | ArrayBufferLike | Blob | ArrayBufferView;
export type WebSocketMessageDataType = ArrayBuffer | string;

export interface WebSocketStreamOptions {
	/**
	 * A single string or an array of strings representing the sub-protocol(s) that the client would like to use, for example "amqp" or "mqtt".
	 *
	 * If this option is included, the connection will only be established if the server reports that it has selected one of these sub-protocols.
	 *
	 * For more information, see:
	 * - https://developer.mozilla.org/en-US/docs/Web/API/WebSocketStream/WebSocketStream#protocols
	 * - https://www.iana.org/assignments/websocket/websocket.xml#subprotocol-name
	 */
	protocols?: string | string[] | undefined;

	/**
	 * An AbortSignal belonging to an AbortController that you want to use to close the WebSocket connection.
	 */
	signal?: AbortSignal | undefined;

	/**
	 * A reference to the WebSocket constructor that should be used to create the WebSocket connection.
	 *
	 * If this option is not provided, the global WebSocket constructor will be used.
	 */
	WebSocket?: typeof window.WebSocket | undefined;
}

export interface WebSocketStreamCloseOptions {
	/**
	 * The code indicating the reason for closing the connection.
	 * If not provided, the default close code will be used.
	 */
	closeCode?: number | undefined;

	/**
	 * The reason for closing the connection.
	 *
	 * If not provided, the default close reason will be used.
	 */
	reason?: string | undefined;
}

export interface WebSocketStreamOpened {
	/**
	 * The extensions selected by the server, if any.
	 * This is a string that contains the extensions negotiated by the server.
	 */
	extensions: string;

	/**
	 * The sub-protocol selected by the server, if any.
	 * This is a string that contains the sub-protocol negotiated by the server.
	 * If no sub-protocol was negotiated, this will be an empty string.
	 * For more information, see: https://developer.mozilla.org/en-US/docs/Web/API/WebSocketStream/opened#protocol
	 */
	protocol: string;

	/**
	 * A ReadableStream that allows reading data received from the WebSocket connection.
	 */
	readable: ReadableStream<WebSocketMessageDataType>;

	/**
	 * A WritableStream that allows sending data over the WebSocket connection.
	 */
	writable: WritableStream<WebSocketSendType>;
}

export interface WebSocketStreamClosed {
	closeCode: number;
	reason: string;
}

const ALLOWED_PROTOCOLS = ['ws:', 'wss:', 'http:', 'https:'];

/**
 * An interface for handling WebSocket connections using streams.
 *
 * For more information, see: https://developer.mozilla.org/en-US/docs/Web/API/WebSocketStream
 */
export class WebSocketStream {
	constructor(url: string, { signal, protocols, WebSocket = globalThis.WebSocket }: WebSocketStreamOptions = {}) {
		if (!ALLOWED_PROTOCOLS.includes(new URL(url).protocol)) {
			throw new SyntaxError(`Failed to create WebSocketStream. Cause: Invalid URL protocol. Possible values are: ${ALLOWED_PROTOCOLS.map(protocol => `"${protocol}"`).join(', ')}.`);
		}
		signal?.addEventListener('abort', () => this.close(), { once: true });
		this._ws = new WebSocket(url, protocols);
		this._ws.binaryType = 'arraybuffer';
		this.opened = new Promise<WebSocketStreamOpened>((resolve, reject) => {
			this._ws.addEventListener('open', () => resolve({
				extensions: this._ws.extensions,
				protocol: this._ws.protocol,
				readable: new ReadableStream<WebSocketMessageDataType>({
					start: controller => {
						this._ws.addEventListener('message', event => controller.enqueue(event.data));
						this._ws.addEventListener('close', () => {
							try { controller.close(); } catch {}
						});
					},
					cancel: () => this._ws.close(),
				}),
				writable: new WritableStream<WebSocketSendType>({
					start: controller => this._ws.addEventListener('close', () => controller.error()),
					write: chunk => this._ws.send(chunk),
					close: () => this._ws.close(),
					abort: (reason: string) => this._ws.close(undefined, reason),
				}),
			}));
			this._ws.addEventListener('error', () => reject(new Error('WebSocket error')));
		});
		this.closed = new Promise<WebSocketStreamClosed>(resolve => {
			this._ws.addEventListener('close', event => {
				resolve({
					closeCode: event.code,
					reason: event.reason
				});
			});
		});
	}

	private readonly _ws: WebSocket;

	/**
	 * A promise that resolves when the WebSocket connection is opened. Among other features, this object contains a
	 * ReadableStream and a WritableStream instance for receiving and sending data on the connection.
	 */
	public readonly opened: Promise<WebSocketStreamOpened>;

	/**
	 * A promise that resolves when the WebSocket connection is closed, providing the close code and reason.
	 */
	public readonly closed: Promise<WebSocketStreamClosed>;

	/**
	 * The URL of the WebSocket connection.
	 */
	get url(): string {
		return this._ws.url;
	}

	/**
	 * Closes the WebSocket connection.
	 */
	close({ closeCode, reason }: WebSocketStreamCloseOptions = {}): void {
		this._ws.close(closeCode, reason);
	}
}
