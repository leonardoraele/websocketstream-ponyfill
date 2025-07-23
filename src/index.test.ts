import { WebSocketStream } from './index.js';
import { suite, test, afterEach, before } from 'node:test';
import { expect } from 'expect';

// Mock WebSocket implementation
class MockWebSocket {
	static instances: MockWebSocket[] = [];
	static clear() { MockWebSocket.instances = []; }
	static mockMessage(data: any) {
		MockWebSocket.instances.forEach(ws => ws.#emit('message', { data }));
	}
	static mockClose(code?: number, reason?: string) {
		MockWebSocket.instances.forEach(ws => ws.#emit('close', { code: code ?? 1000, reason: reason ?? '' }));
	}
	url: string;
	protocol: string = '';
	extensions: string = '';
	binaryType: string = '';
	readyState: number = 0;
	sent: any[] = [];
	listeners: Record<string, Function[]> = {};
	constructor(url: string, _protocols?: string | string[]) {
		this.url = url;
		MockWebSocket.instances.push(this);
		setTimeout(() => this.#emit('open'), 10);
	}
	addEventListener(event: string, cb: Function) {
		if (!this.listeners[event]) this.listeners[event] = [];
		this.listeners[event].push(cb);
	}
	send(data: any) { this.sent.push(data); }
	close(code?: number, reason?: string) {
		if (this.readyState === 3) return; // Already closed
		setTimeout(() => this.#emit('close', { code: code ?? 1000, reason: reason ?? '' }), 10);
		this.readyState = 3; // Closed state
	}
	#emit(event: string, arg?: any) {
		(this.listeners[event] || []).forEach(cb => cb(arg));
	}
}

suite('WebSocketStream', () => {
	before(() => {
		// @ts-ignore
		global.WebSocket = MockWebSocket;
	});
	afterEach(() => MockWebSocket.clear());

	test('throws on invalid protocol', () => {
		expect(() => new WebSocketStream('ftp://localhost')).toThrow();
	});

	test('opens and closes connection', async () => {
		const ws = new WebSocketStream('ws://localhost');
		const opened = await ws.opened;
		expect(opened.protocol).toBe('');
		expect(opened.extensions).toBe('');
		expect(opened.readable).toBeInstanceOf(ReadableStream);
		expect(opened.writable).toBeInstanceOf(WritableStream);
		ws.close({ reason: 'bye' });
		const closed = await ws.closed;
		expect(closed.reason).toBe('bye');
		expect(closed.closeCode).toBe(1000);
	});

	test('sends and receives messages', async () => {
		const ws = new WebSocketStream('ws://localhost');
		const { readable, writable } = await ws.opened;
		const writer = writable.getWriter();
		const reader = readable.getReader();

		{
			// Write a message
			expect(MockWebSocket.instances[0]?.sent).toEqual([]);
			await writer.write('hello');
			expect(MockWebSocket.instances[0]?.sent).toEqual(['hello']);
			await writer.write('world');
			expect(MockWebSocket.instances[0]?.sent).toEqual(['hello', 'world']);
		}

		{
			// Simulate receiving a message
			setTimeout(() => MockWebSocket.mockMessage('world'), 10);
			const { value, done } = await reader.read();
			expect(value).toBe('world');
			expect(done).toBe(false);
		}

		writer.releaseLock();
		reader.releaseLock();
	});

	suite('closing connection', () => {

		test('connection closed from the other end', async () => {
			const ws = new WebSocketStream('ws://localhost');
			const { readable, writable } = await ws.opened;
			const writer = writable.getWriter();
			const reader = readable.getReader();

			// Simulate the connection being closed from the other end
			MockWebSocket.mockClose(1001, 'Going away');
			await expect(reader.read()).resolves.toEqual({ value: undefined, done: true });
			await expect(writer.closed).rejects.toBeUndefined();
			await expect(reader.closed).resolves.toBeUndefined();

			writer.releaseLock();
			reader.releaseLock();
		});

		test('signal aborts connection', async () => {
			const controller = new AbortController();
			const ws = new WebSocketStream('ws://localhost', { signal: controller.signal });
			const { readable, writable } = await ws.opened;
			const writer = writable.getWriter();
			const reader = readable.getReader();

			controller.abort(); // Abort the connection

			await expect(reader.read()).resolves.toEqual({ value: undefined, done: true });
			await expect(writer.closed).rejects.toBeUndefined();
			await expect(reader.closed).resolves.toBeUndefined();

			writer.releaseLock();
			reader.releaseLock();
		});

		test('cancel readable stream', async () => {
			const ws = new WebSocketStream('ws://localhost');
			const { readable, writable } = await ws.opened;
			const writer = writable.getWriter();
			const reader = readable.getReader();

			// Cancel the readable stream
			await reader.cancel('Cancelled by test');
			expect(MockWebSocket.instances[0]?.sent).toEqual([]);

			// Check that the writable stream is still open
			await expect(writer.closed).rejects.toBeUndefined();
			await expect(reader.closed).resolves.toBeUndefined();

			reader.releaseLock();
			writer.releaseLock();
		});

		test('abort writable stream', async () => {
			const ws = new WebSocketStream('ws://localhost');
			const { readable, writable } = await ws.opened;
			const writer = writable.getWriter();
			const reader = readable.getReader();

			// Abort the writable stream
			await expect(writer.abort('Abort by test')).resolves.toBeUndefined();
			expect(MockWebSocket.instances[0]?.sent).toEqual([]);

			// Check that the readable stream is still open
			await expect(reader.read()).resolves.toEqual({ value: undefined, done: true });
			await expect(writer.closed).rejects.toBe('Abort by test');
			await expect(reader.closed).resolves.toBeUndefined();

			writer.releaseLock();
			reader.releaseLock();
		});
	});
});
