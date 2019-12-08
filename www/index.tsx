import { React, ReactDOM } from 'https://unpkg.com/es-react'
import { useAsyncEffect } from './utils/effect.js'
import buildRPC from './utils/rpc.js'

const rpc = buildRPC('http://localhost:8080')
function App() {
    const pkg = useAsyncEffect(async () => {
        console.log(await rpc.a.it())
        console.log(await rpc.a.it2())
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
