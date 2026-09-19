/** Bound engine-owned data before it enters the assistant's context. */
export function compactJson(value: unknown): string {
    let remaining = 12000;
    const omitted: string[] = [];
    const mark = (path: string) => {
        if (omitted.length < 10) omitted.push(path);
    };

    function visit(item: any, path: string, depth: number): any {
        if (remaining < 64 || depth > 12) {
            mark(path);
            return '[omitted]';
        }
        if (typeof item === 'string') {
            const limit = Math.min(2048, Math.floor(remaining / 6));
            const result = item.length > limit ? item.slice(0, limit) + '…' : item;
            if (item.length > limit) mark(path);
            remaining -= JSON.stringify(result).length;
            return result;
        }
        if (item === null || typeof item !== 'object') {
            remaining -= 24;
            return item;
        }
        const result: any = Array.isArray(item) ? [] : {};
        const entries = Object.entries(item);
        for (let i = 0; i < entries.length; i++) {
            const [key, child] = entries[i];
            if (i >= 200 || remaining < JSON.stringify(key).length + 80) {
                mark(path);
                break;
            }
            remaining -= JSON.stringify(key).length + 4;
            const converted = visit(child, `${path}.${key}`, depth + 1);
            if (Array.isArray(result)) result.push(converted);
            else result[key] = converted;
        }
        return result;
    }

    const result = visit(value, '$', 0);
    return JSON.stringify(omitted.length ? {result, truncated: true, omitted, hint: 'Narrow the query or request a smaller page.'} : result);
}

export interface LogEntry {
    id: number;
    stream: 'stdout' | 'stderr';
    text: string
}

/** A bounded session log. Cursor reads never resend previously consumed lines. */
export class SessionLog {
    private entries: LogEntry[] = [];
    private nextId = 1;
    private cursor = 0;
    private pending = {stdout: '', stderr: ''};

    append(stream: LogEntry['stream'], chunk: string): void {
        const lines = (this.pending[stream] + chunk.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')).split(/\r?\n/);
        this.pending[stream] = lines.pop() ?? '';
        for (const line of lines) this.push(stream, line);
        // A process printing without newlines must not grow memory without bound.
        if (this.pending[stream].length > 2048) {
            this.push(stream, this.pending[stream].slice(0, 2048) + '… [line truncated]');
            this.pending[stream] = '';
        }
    }

    flush(): void {
        for (const stream of ['stdout', 'stderr'] as const) {
            this.push(stream, this.pending[stream]);
            this.pending[stream] = '';
        }
    }

    private push(stream: LogEntry['stream'], text: string): void {
        if (!text.trim()) return;
        if (text.length > 2048) text = text.slice(0, 2048) + '… [line truncated]';
        this.entries.push({id: this.nextId++, stream, text});
        if (this.entries.length > 1000) this.entries.shift();
    }

    read(limit = 50, cursor = this.cursor) {
        const firstId = this.entries[0]?.id ?? this.nextId;
        const dropped = Math.max(0, firstId - cursor - 1);
        const lines: LogEntry[] = [];
        let size = 0;
        for (const entry of this.entries) {
            if (entry.id <= cursor) continue;
            const entrySize = JSON.stringify(entry).length;
            if (lines.length >= limit || size + entrySize > 11000) break;
            lines.push(entry);
            size += entrySize;
        }
        const nextCursor = lines.at(-1)?.id ?? Math.max(cursor, firstId - 1);
        this.cursor = nextCursor;
        return {lines, nextCursor, hasMore: nextCursor < this.nextId - 1, ...(dropped ? {dropped} : {})};
    }
}
