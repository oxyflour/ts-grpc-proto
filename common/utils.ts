export function getSrvFuncName(entry: string) {
    const split = ('srv/' + entry).split('/'),
        funcName = split.pop() || '',
        srvName = split.join('/').replace(/\W/g, '_')
    return [srvName, funcName]
}

export function sleep(delay: number) {
    return new Promise(resolve => setTimeout(resolve, delay))
}

export function asyncCache<R, F extends (...args: any[]) => Promise<R>>(fn: F) {
    const cache = { } as { [key: string]: Promise<R> }
    return (function (...args: any[]) {
        const key = JSON.stringify(args)
        return cache[key] || (cache[key] = fn(...args))
    }) as F
}

export type AsyncFunction<T> = (...args: any[]) => Promise<T>
export type AsyncIteratorFunction<T> = (...args: any[]) => AsyncIterableIterator<T>
export interface ApiDefinition { [name: string]: string | AsyncIteratorFunction<any> | AsyncFunction<any> | ApiDefinition }

export interface ProxyStackItem {
    target: any,
    propKey: any,
    receiver: any,
}

export function hookFunc<M extends ApiDefinition>(
        methods: M,
        proxy: (...stack: ProxyStackItem[]) => any,
        stack = [ ] as ProxyStackItem[]): M {
    return new Proxy(methods, {
        get(target, propKey, receiver) {
            const next = [{ target, propKey, receiver }].concat(stack)
            return hookFunc(proxy(...next) as ApiDefinition, proxy, next)
        }
    })
}

export function wrapFunc<M extends ApiDefinition>(
        receiver: M,
        callback: (...stack: ProxyStackItem[]) => void,
        stack = [ ] as ProxyStackItem[]) {
    if (typeof receiver === 'function') {
        return callback(...stack)
    } else if (typeof receiver === 'string') {
        return receiver
    } else {
        const ret = { } as any
        for (const propKey in receiver) {
            const target = receiver[propKey],
                next = [{ target, propKey, receiver }].concat(stack)
            ret[propKey] = wrapFunc(target as ApiDefinition, callback, next)
        }
        return ret
    }
}
