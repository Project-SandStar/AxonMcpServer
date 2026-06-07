import { StreamingResponseHandler, createCancellableStream, createTimedStream } from '../../../src/streaming/StreamingResponseHandler';

// Mock Anthropic SDK
const mockStream = {
    controller: {
        abort: jest.fn()
    },
    finalMessage: jest.fn(),
    [Symbol.asyncIterator]: jest.fn()
};

const mockClient = {
    messages: {
        stream: jest.fn(),
        create: jest.fn()
    }
};

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    })
}));

// Mock performance monitor
jest.mock('../../../src/utils/performanceMonitorInstance', () => ({
    measureAsync: jest.fn((name, fn) => fn())
}));

describe('StreamingResponseHandler', () => {
    let handler: StreamingResponseHandler;

    beforeEach(() => {
        jest.clearAllMocks();
        handler = new StreamingResponseHandler(mockClient as any);
    });

    describe('streamGenerate', () => {
        it('should stream response with progress callbacks', async () => {
            const chunks = [
                { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
                { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } },
                { type: 'content_block_delta', delta: { type: 'text_delta', text: '!' } }
            ];

            mockStream[Symbol.asyncIterator] = jest.fn(function* () {
                for (const chunk of chunks) {
                    yield chunk;
                }
            });

            mockStream.finalMessage.mockResolvedValue({
                model: 'claude-sonnet-4-20250514',
                stop_reason: 'end_turn'
            });

            mockClient.messages.stream.mockResolvedValue(mockStream);

            const onProgress = jest.fn();
            const onComplete = jest.fn();

            const result = await handler.streamGenerate('test prompt', {
                onProgress,
                onComplete,
                bufferSize: 5
            });

            expect(result).toBe('Hello world!');
            expect(onProgress).toHaveBeenCalled();
            expect(onComplete).toHaveBeenCalledWith(
                'Hello world!',
                expect.objectContaining({
                    totalCharacters: 12,
                    model: 'claude-sonnet-4-20250514'
                })
            );
        });

        it('should buffer small chunks', async () => {
            const chunks = [
                { type: 'content_block_delta', delta: { type: 'text_delta', text: 'H' } },
                { type: 'content_block_delta', delta: { type: 'text_delta', text: 'e' } },
                { type: 'content_block_delta', delta: { type: 'text_delta', text: 'l' } },
                { type: 'content_block_delta', delta: { type: 'text_delta', text: 'l' } },
                { type: 'content_block_delta', delta: { type: 'text_delta', text: 'o' } }
            ];

            mockStream[Symbol.asyncIterator] = jest.fn(function* () {
                for (const chunk of chunks) {
                    yield chunk;
                }
            });

            mockStream.finalMessage.mockResolvedValue({
                model: 'claude-sonnet-4-20250514',
                stop_reason: 'end_turn'
            });

            mockClient.messages.stream.mockResolvedValue(mockStream);

            const onProgress = jest.fn();

            await handler.streamGenerate('test', {
                onProgress,
                bufferSize: 3
            });

            // Should flush when buffer reaches 3 chars, then again at end
            expect(onProgress).toHaveBeenCalled();
            // First call should have accumulated first 3 chars
            const firstCall = onProgress.mock.calls[0];
            expect(firstCall[1].length).toBeGreaterThanOrEqual(3);
        });

        it('should handle cancellation', async () => {
            const { signal, cancel } = createCancellableStream();

            mockStream[Symbol.asyncIterator] = jest.fn(async function* () {
                yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Start' } };
                // Simulate cancellation during stream
                cancel();
                throw new Error('Request cancelled');
            });

            mockClient.messages.stream.mockResolvedValue(mockStream);

            const onError = jest.fn();

            await expect(
                handler.streamGenerate('test', {
                    signal,
                    onError
                })
            ).rejects.toThrow('cancelled');

            expect(onError).toHaveBeenCalled();
        });

        it('should handle already aborted signal', async () => {
            const controller = new AbortController();
            controller.abort();

            await expect(
                handler.streamGenerate('test', {
                    signal: controller.signal
                })
            ).rejects.toThrow('cancelled');
        });

        it('should flush buffer on timeout', async () => {
            jest.useFakeTimers();

            const chunks = [
                { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } }
            ];

            let resolveStream: any;
            const streamPromise = new Promise(resolve => {
                resolveStream = resolve;
            });

            mockStream[Symbol.asyncIterator] = jest.fn(async function* () {
                for (const chunk of chunks) {
                    yield chunk;
                }
                await streamPromise;
            });

            mockStream.finalMessage.mockResolvedValue({
                model: 'claude-sonnet-4-20250514',
                stop_reason: 'end_turn'
            });

            mockClient.messages.stream.mockResolvedValue(mockStream);

            const onProgress = jest.fn();

            const promise = handler.streamGenerate('test', {
                onProgress,
                bufferSize: 100, // Large buffer
                bufferTimeout: 50
            });

            // Advance time to trigger timeout flush
            jest.advanceTimersByTime(60);
            resolveStream();

            await promise;

            jest.useRealTimers();
        });

        it('should call onError on streaming error', async () => {
            const error = new Error('Network error');

            mockClient.messages.stream.mockRejectedValue(error);

            const onError = jest.fn();

            await expect(
                handler.streamGenerate('test', { onError })
            ).rejects.toThrow('Network error');

            expect(onError).toHaveBeenCalledWith(error);
        });

        it('should handle onProgress callback errors gracefully', async () => {
            const chunks = [
                { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello world!' } }
            ];

            mockStream[Symbol.asyncIterator] = jest.fn(function* () {
                for (const chunk of chunks) {
                    yield chunk;
                }
            });

            mockStream.finalMessage.mockResolvedValue({
                model: 'claude-sonnet-4-20250514',
                stop_reason: 'end_turn'
            });

            mockClient.messages.stream.mockResolvedValue(mockStream);

            const onProgress = jest.fn(() => {
                throw new Error('Callback error');
            });

            // Should not throw, just log warning
            const result = await handler.streamGenerate('test', {
                onProgress,
                bufferSize: 5
            });

            expect(result).toBe('Hello world!');
        });

        it('should accumulate text correctly', async () => {
            const chunks = [
                { type: 'content_block_delta', delta: { type: 'text_delta', text: 'The' } },
                { type: 'content_block_delta', delta: { type: 'text_delta', text: ' quick' } },
                { type: 'content_block_delta', delta: { type: 'text_delta', text: ' brown' } },
                { type: 'content_block_delta', delta: { type: 'text_delta', text: ' fox' } }
            ];

            mockStream[Symbol.asyncIterator] = jest.fn(function* () {
                for (const chunk of chunks) {
                    yield chunk;
                }
            });

            mockStream.finalMessage.mockResolvedValue({
                model: 'claude-sonnet-4-20250514',
                stop_reason: 'end_turn'
            });

            mockClient.messages.stream.mockResolvedValue(mockStream);

            const progressUpdates: string[] = [];
            const onProgress = jest.fn((chunk, accumulated) => {
                progressUpdates.push(accumulated);
            });

            const result = await handler.streamGenerate('test', {
                onProgress,
                bufferSize: 1
            });

            expect(result).toBe('The quick brown fox');
            // Each progress update should have more accumulated text
            for (let i = 1; i < progressUpdates.length; i++) {
                expect(progressUpdates[i].length).toBeGreaterThanOrEqual(
                    progressUpdates[i - 1].length
                );
            }
        });

        it('should ignore non-text chunks', async () => {
            const chunks = [
                { type: 'content_block_start', content_block: { type: 'text' } },
                { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
                { type: 'message_delta', delta: {} },
                { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } }
            ];

            mockStream[Symbol.asyncIterator] = jest.fn(function* () {
                for (const chunk of chunks) {
                    yield chunk;
                }
            });

            mockStream.finalMessage.mockResolvedValue({
                model: 'claude-sonnet-4-20250514',
                stop_reason: 'end_turn'
            });

            mockClient.messages.stream.mockResolvedValue(mockStream);

            const result = await handler.streamGenerate('test', {
                bufferSize: 1
            });

            expect(result).toBe('Hello world');
        });
    });

    describe('generate (non-streaming)', () => {
        it('should generate non-streaming response', async () => {
            mockClient.messages.create.mockResolvedValue({
                content: [{ type: 'text', text: 'Hello world' }]
            });

            const result = await handler.generate('test prompt');

            expect(result).toBe('Hello world');
            expect(mockClient.messages.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    model: 'claude-sonnet-4-20250514',
                    messages: [{ role: 'user', content: 'test prompt' }]
                }),
                expect.any(Object)
            );
        });

        it('should handle cancellation', async () => {
            const controller = new AbortController();
            controller.abort();

            mockClient.messages.create.mockRejectedValue(new Error('Aborted'));

            await expect(
                handler.generate('test', controller.signal)
            ).rejects.toThrow();
        });

        it('should throw on unexpected response type', async () => {
            mockClient.messages.create.mockResolvedValue({
                content: [{ type: 'image', data: 'base64data' }]
            });

            await expect(
                handler.generate('test')
            ).rejects.toThrow('Unexpected response type');
        });
    });

    describe('Utility functions', () => {
        it('createCancellableStream should create cancellable stream', () => {
            const { signal, cancel } = createCancellableStream();

            expect(signal.aborted).toBe(false);
            
            cancel();
            
            expect(signal.aborted).toBe(true);
        });

        it('createTimedStream should auto-cancel after timeout', () => {
            jest.useFakeTimers();

            const { signal } = createTimedStream(1000);

            expect(signal.aborted).toBe(false);

            jest.advanceTimersByTime(1000);

            expect(signal.aborted).toBe(true);

            jest.useRealTimers();
        });

        it('createTimedStream cancel should clear timeout', () => {
            jest.useFakeTimers();

            const { signal, cancel } = createTimedStream(1000);

            cancel();

            expect(signal.aborted).toBe(true);

            jest.useRealTimers();
        });
    });

    describe('Metadata', () => {
        it('should include complete metadata', async () => {
            const chunks = [
                { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Test response' } }
            ];

            mockStream[Symbol.asyncIterator] = jest.fn(function* () {
                for (const chunk of chunks) {
                    yield chunk;
                }
            });

            mockStream.finalMessage.mockResolvedValue({
                model: 'claude-sonnet-4-20250514',
                stop_reason: 'end_turn'
            });

            mockClient.messages.stream.mockResolvedValue(mockStream);

            const onComplete = jest.fn();

            await handler.streamGenerate('test', {
                onComplete,
                bufferSize: 1
            });

            expect(onComplete).toHaveBeenCalledWith(
                'Test response',
                expect.objectContaining({
                    duration: expect.any(Number),
                    totalChunks: 1,
                    totalCharacters: 13,
                    model: 'claude-sonnet-4-20250514',
                    stopReason: 'end_turn'
                })
            );
        });
    });
});
