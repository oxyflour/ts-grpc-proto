import React, { useReducer, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { HashRouter, Route, Switch, Link } from 'react-router-dom'
import { useAsyncEffect, buildRedux } from './effect'
import buildRPC from './rpc'

const rpc = buildRPC('https://dev.yff.me:8443')

const builder = buildRedux({ log: [] as string[] }),
    Reset = builder.action(() => ({ }), state => ({ ...state, log: [] })),
    Append = builder.action((line: string) => ({ line }), (state, action) => ({ ...state, log: state.log.concat(action.line) }))
function Logger() {
    const [state, dispatch] = useReducer(builder.reducer, builder.init)
    useEffect(() => {
        dispatch(Reset())
        const st = rpc.st()
        async function run() {
            for await (const i of st) {
                dispatch(Append(i))
            }
        }
        run()
        return () => void st.return()
    }, [])
    return <div>
        { state.log.map((line, index) => <div key={ index }>{ line }</div>) }
    </div>
}

function App() {
    const pkg = useAsyncEffect(() => rpc.workflow.list({ a: 'b', c: 'd' }), [])
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

ReactDOM.render(<HashRouter>
    <div><Link to="/0">0</Link> <Link to="/1">1</Link></div>
    <Switch>
        <Route path="/0">
            <App />
        </Route>
        <Route path="/1">
            <Logger />
        </Route>
    </Switch>
</HashRouter>, document.getElementById('main'))
