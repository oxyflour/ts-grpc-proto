import React, { useReducer, useEffect, useState, useRef } from 'react'
import ReactDOM from 'react-dom'
import { HashRouter, Route, Switch } from 'react-router-dom'
import { TooltipHost } from 'office-ui-fabric-react/lib/Tooltip'
import { useId } from '@uifabric/react-hooks'

import buildRPC from './rpc'
import { useAsyncEffect, buildRedux, withMouseDown } from './effect'
import { debounce } from '../common/utils'

import './index.less'
import { calcSpanList as clacRows, drawSpanList, TIME, TimelineRow } from './utils/canvas'

const rpc = buildRPC('https://dev.yff.me:8443')

const builder = buildRedux({ log: [] as string[] }),
    Reset = builder.action(() => ({ }), state => ({ ...state, log: [] })),
    Append = builder.action((line: string) => ({ line }),
        (state, action) => ({ ...state, log: state.log.concat(action.line) }))
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

function Timeline({ rows }: { rows: TimelineRow[] }) {
    const id = useId('flow')
    return <div>
    {
        rows.map(item => item.spans).flat()
            .map(({ left, top, width, height, name, node }, index) => <TooltipHost key={ index }
                content={
                    <>
                        <b>Name</b>: { name }<br />
                        <b>Phase</b>: { node.phase }
                    </>
                }
                calloutProps={{ target: `#${id}-${index}` }}>
                <div id={ `${id}-${index}` } className="flow-span" style={{
                    left, top, width: width, height: height
                }}></div>
            </TooltipHost>)
    }
    </div>
}

function Main() {
    const now = Date.now(),
        [[start, end], setRange] = useState([now - TIME.week, now + TIME.day]),
        cvRef = useRef<HTMLCanvasElement>(null),
        timelineTop = 40,
        width = window.innerWidth,
        height = window.innerHeight - timelineTop,
        dpi = window.devicePixelRatio,
        t2w = width / (end - start),
        w2t = 1 / t2w,
        range = { start, end, width, height, t2w, w2t }

    const workflows = useAsyncEffect(rpc.workflow.list, []),
        pods = useAsyncEffect(rpc.pod.list, []),
        [rows, setRows] = useState([] as TimelineRow[]),
        setRowsDebounced = debounce(setRows, 1000)

    useEffect(() => {
        const cv = cvRef.current,
            dc = cv && cv.getContext('2d'),
            rows = clacRows(range, pods.value || [], workflows.value || [])
        if (cv && dc) {
            if (!(cv as any).dpiScaled) {
                (cv as any).dpiScaled = dpi
                dc.scale(dpi, dpi)
            }
            drawSpanList(dc, range, rows)
        }
        setRowsDebounced(rows)
    }, [start, end, workflows.value, pods.value])

    function onWheel(evt: React.WheelEvent) {
        const cv = cvRef.current
        if (cv) {
            const { left, right, width } = cv.getBoundingClientRect(),
                delta = (end - start) * evt.deltaY * 0.01,
                f1 = (evt.clientX - left) / width,
                f2 = (right - evt.clientX) / width,
                val = end - start + delta
            if (val > 30 * TIME.minute && val < TIME.week) {
                setRange([start - delta * f1, end + delta * f2])
            }
        }
    }

    const onMouseDown = (evt: React.MouseEvent) => withMouseDown(evt as any, (evt, init) => {
        const delta = (evt.clientX - init.clientX) * w2t
        setRange([start - delta, end - delta])
    })

    return <>
        <div style={{ height: timelineTop, lineHeight: `${timelineTop}px` }}>
            uvw
        </div>
        <div className="timeline-main" style={{ width, height }}
            onMouseDown={ onMouseDown } onWheel={ onWheel }>
            {
                workflows.loading ?
                    <div>loading...</div> :
                workflows.error ?
                    <div>error: { workflows.error.message }</div> :
                    null
            }
            <Timeline rows={ rows } />
        </div>
        <canvas className="timeline-bg" style={{ width, height }}
            width={ width * dpi } height={ height * dpi } ref={ cvRef } />
    </>
}

ReactDOM.render(<HashRouter>
    <Switch>
        <Route path="/">
            <Main />
        </Route>
        <Route path="/1">
            <Logger />
        </Route>
    </Switch>
</HashRouter>, document.getElementById('main'))
