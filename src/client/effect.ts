import React, { DependencyList, useState, useEffect } from 'react'

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
