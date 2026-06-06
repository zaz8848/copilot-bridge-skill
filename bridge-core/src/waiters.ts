/**
 * 长轮询挂起表：MCP 客户端调 GET /api/wait/:task_id 时挂在这里，
 * router 收到飞书回复后唤醒。
 * 进程重启会丢失挂起状态，但任务本身在 SQLite 里，重启后 MCP 客户端会重连重挂。
 */

interface Waiter {
    resolve: (replyText: string) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout | null;
}

const waiters = new Map<string, Waiter>();

export function registerWaiter(
    taskId: string,
    timeoutMs: number,
    onReply: (text: string) => void,
    onTimeout: () => void
): () => void {
    // 同一 task_id 二次挂起：先取消旧的
    const old = waiters.get(taskId);
    if (old) {
        if (old.timer) clearTimeout(old.timer);
        old.reject(new Error("superseded"));
        waiters.delete(taskId);
    }
    // timeoutMs <= 0 表示永不超时（HTTP 长挂）
    const timer =
        timeoutMs > 0
            ? setTimeout(() => {
                waiters.delete(taskId);
                onTimeout();
            }, timeoutMs)
            : null;

    waiters.set(taskId, {
        resolve: (text) => {
            if (timer) clearTimeout(timer);
            onReply(text);
        },
        reject: (err) => {
            if (timer) clearTimeout(timer);
            // 当作 timeout 类错误处理
            console.error(`[waiters] task ${taskId} rejected: ${err.message}`);
            onTimeout();
        },
        timer,
    });

    return () => {
        const w = waiters.get(taskId);
        if (w) {
            if (w.timer) clearTimeout(w.timer);
            waiters.delete(taskId);
        }
    };
}

export function resolveWaiter(taskId: string, text: string): boolean {
    const w = waiters.get(taskId);
    if (!w) return false;
    waiters.delete(taskId);
    w.resolve(text);
    return true;
}

/** 列出当前所有 active waiters 的 task_id —— 给 router 判断有没有人在等 */
export function listActiveWaiterTaskIds(): string[] {
    return Array.from(waiters.keys());
}
