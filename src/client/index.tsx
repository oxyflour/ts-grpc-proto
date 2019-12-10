import React from 'react'
import ReactDOM from 'react-dom'
import { useAsyncEffect } from './effect'
import buildRPC from './rpc'

import 'babel-polyfill'

const rpc = buildRPC('http://localhost:8080')
function App() {
    const pkg = useAsyncEffect(async () => {
        console.log(await rpc.a.it())
        console.log(await rpc.a.it2())
        for await (const i of rpc.st()) {
            console.log(i)
        }
        return await rpc.it3()
    }, [])
    return <div>
        Main
        {
            pkg.loading ?
                <div>loading...</div> :
            pkg.error ?
                <div>error: { pkg.error.stack }</div> :
            <pre>
                { JSON.stringify(pkg.value, null, 2) }
            </pre>
        }
    </div>
}

ReactDOM.render(<App />, document.getElementById('main'))
