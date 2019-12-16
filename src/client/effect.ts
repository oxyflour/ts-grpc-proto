import { DependencyList, useState, useEffect, Reducer } from 'react'

export function useAsyncEffect<V>(fn: () => Promise<V>, val?: DependencyList) {
    const [value, setValue] = useState<V>(),
        [loading, setLoading] = useState(false),
        [error, setError] = useState(),
        [lastUpdate, setLastUpdate] = useState(0)
    async function run() {
        setLoading(true)
        setError(null)
        try {
            setValue(await fn())
        } catch (err) {
            console.error(err)
            setError(err)
        }
        setLoading(false)
    }
    function reload() {
        setLastUpdate(Date.now())
    }
    useEffect(() => { run() }, (val || []).concat(lastUpdate))
    return { value, loading, error, reload }
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

export function withMouseDown(evt: MouseEvent,
    onMove: (evt: MouseEvent, init: { clientX: number, clientY: number }) => void,
    onUp?: (evt: MouseEvent) => void) {
    const { clientX, clientY } = evt
    function onMouseMove(evt: MouseEvent) {
        onMove(evt, { clientX, clientY })
    }
    function onMouseUp(evt: MouseEvent) {
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
        onUp && onUp(evt)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
}
