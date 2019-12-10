import { DependencyList, useState, useEffect, Reducer } from 'react'

export function useAsyncEffect<V>(fn: () => Promise<V>, val?: DependencyList) {
    const [value, setValue] = useState<V>(),
        [loading, setLoading] = useState(false),
        [error, setError] = useState()
    async function run() {
        setLoading(true)
        try {
            setValue(await fn())
        } catch (err) {
            console.error(err)
            setError(err)
        }
        setLoading(false)
    }
    useEffect(() => { run() }, val)
    return { value, loading, error }
}

let actionId = 0
const id = <T>(x: T) => x
export function buildRedux<S>(init: S) {
    const map = { } as { [key: string]: Reducer<S, any> }
    return {
        init,
        action<U extends any[], A>(make: (...args: U) => A, reduce: (state: S, action: A) => S) {
            const type = `${make.name}-${actionId ++}`
            map[type] = reduce
            return (...args: U) => ({ type, ...make(...args) })
        },
        reducer<A extends { type: string }>(state: S, action: A) {
            return (map[action.type] || id)(state, action)
        }
    }
}
