import React, { useReducer, useEffect, useState, useRef } from 'react'
import ReactDOM from 'react-dom'
import { HashRouter, Route, Switch } from 'react-router-dom'

import buildRPC from './rpc'
import { useAsyncEffect, buildRedux, withMouseDown } from './effect'
import { debounce, clamp } from '../common/utils'

import './index.less'
import { calcSpanList as clacRows, drawSpanList, TIME, TimelineRow, Span, TimeRange } from './utils/canvas'

const rpc = buildRPC('https://dev.emsim.rnd.huawei.com:8443')

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

function Duration({ from, to }: { from: string | number, to: string | number }) {
    const time = new Date(to).getTime() - new Date(from).getTime()
    return <span>{ Math.floor(time / TIME.minute) } min</span>
}

function Tooltip({ content, left, top, bottom, onMouseEnter, onMouseLeave }: {
    content: JSX.Element
    left: number
    top?: number
    bottom?: number
    onMouseEnter: (evt: React.MouseEvent<any>) => any
    onMouseLeave:   (evt: React.MouseEvent<any>) => any
}) {
    const cls = top !== undefined ? 'tooltip down' : bottom !== undefined ? 'tooltip up' : 'tooltip',
        style = top !== undefined ? { left, top }  : bottom !== undefined ? { left, bottom } : { }
    return <div className={ cls } style={ style }
        onMouseEnter={ onMouseEnter } onMouseLeave={ onMouseLeave }>
        <div className="tooltip-content">
            { content }
        </div>
    </div>
}

function Timeline({ rows, onMouseEnter, onMouseLeave }: {
    rows: TimelineRow[]
    onMouseEnter: (span: Span, evt: React.MouseEvent<any>) => any
    onMouseLeave: (span: Span, evt: React.MouseEvent<any>) => any
}) {
    return <div>
    {
        rows.map(item => item.spans).flat()
            .map((span, index) => <div key={ index }
                onMouseEnter={ evt => onMouseEnter(span, evt) }
                onMouseLeave={ evt => onMouseLeave(span, evt) }
                className="flow-span" style={ span } />)
    }
    </div>
}

function getContentHeight(rows: TimelineRow[]) {
    const { spans: [last] } = rows[rows.length - 1] || { spans: [] },
        { spans: [first] } = rows[0] || { spans: [] }
    return last && first ? last.top + last.height - first.top : 0
}

function clampTopVal(top: number, range: TimeRange, contentHeight: number) {
    return range.height > contentHeight ? 0 : clamp(top, range.height - contentHeight, 0)
}

function Main() {
    const now = Date.now(),
        [[start, end, top], setRange] = useState([now - TIME.day, now + TIME.hour, 0]),
        cvRef = useRef<HTMLCanvasElement>(null),
        timelineTop = 40,
        width = window.innerWidth,
        height = window.innerHeight - timelineTop,
        dpi = window.devicePixelRatio,
        t2w = width / (end - start),
        w2t = 1 / t2w,
        range = { start, end, top, width, height, t2w, w2t },
        [rows, setRows] = useState([] as TimelineRow[]),
        setRowsDebounced = debounce(setRows, 1000),
        [filter, setFilter] = useState(''),
        [namespace, setNamespace] = useState('hmr'),
        [contentHeight, setContentHeight] = useState(0),
        [tooltip, setTooltip] = useState({ left: 0, top: 0, height: 0, content: null as null | JSX.Element, shown: false }),
        setTopDebounced = debounce((top: number) => setRange([range.start, range.end, top]), 100),
        data = useAsyncEffect(() => Promise.all([rpc.pod.list(), rpc.workflow.list()]), [namespace])

    useEffect(() => {
        const cv = cvRef.current,
            dc = cv && cv.getContext('2d'),
            [pods, workflows] = data.value || [[], []],
            rows = clacRows(range, pods, workflows, filter)
        if (cv && dc) {
            if (!(cv as any).dpiScaled) {
                (cv as any).dpiScaled = dpi
                dc.scale(dpi, dpi)
            }
            drawSpanList(dc, range, rows)
        }
        const contentHeight = getContentHeight(rows),
            top = clampTopVal(range.top, range, contentHeight)
        if (top !== range.top) {
            setTopDebounced(top)
        }
        setContentHeight(contentHeight)
        setRows([])
        setRowsDebounced(rows)
    }, [start, end, top, filter, data.value])

    function onWheel(evt: React.WheelEvent) {
        const cv = cvRef.current
        if (cv) {
            const { left, right, width } = cv.getBoundingClientRect(),
                delta = (end - start) * evt.deltaY * 0.001,
                f1 = (evt.clientX - left) / width,
                f2 = (right - evt.clientX) / width,
                val = end - start + delta
            if (val > 10 * TIME.minute && val < TIME.week) {
                setRange([start - delta * f1, end + delta * f2, top])
            }
        }
    }

    const onMouseDown = (evt: React.MouseEvent) => {
        withMouseDown(evt as any, (evt, init) => {
            const delta = (evt.clientX - init.clientX) * w2t,
                clampped = clampTopVal(top + evt.clientY - init.clientY, range, contentHeight)
            setRange([start - delta, end - delta, clampped])
        })
    }

    function onSpanEnter(span: Span | null, evt: React.MouseEvent<unknown>) {
        const { top, height } = span || tooltip,
            left = span ? evt.clientX : tooltip.left,
            content = span ? <div>
                <b>Name: </b> { span.node.name }<br />
                <b>Duration: </b> { !span.node.finishedAt && 'More than' } <Duration from={ span.start } to={ span.end } /><br />
                <a href={ `https://k8s.emsim.rnd.huawei.com/#/pod/${namespace}/${span.node.id}?namespace=${namespace}` } target="_blank">Detail</a>
                <span> </span>
                <a href={ `https://k8s.emsim.rnd.huawei.com/#/log/${namespace}/${span.node.id}/pod?namespace=${namespace}` } target="_blank">Log</a>
            </div> : tooltip.content
        setTooltip({ content, left, top, height, shown: true })
    }

    function onSpanLeave() {
        setTooltip({ ...tooltip, shown: false })
    }

    useEffect(() => {
        if (!tooltip.shown && tooltip.content) {
            const timeout = setTimeout(() => setTooltip({ ...tooltip, content: null }), 200)
            return () => clearTimeout(timeout)
        }
    }, [tooltip.shown, tooltip.content])

    return <>
        <div style={{ height: timelineTop, lineHeight: `${timelineTop}px` }}>
            namespace: <select value={ namespace } onChange={ evt => setNamespace(evt.target.value) }>
                <option>hmr</option>
            </select>
            <span>  </span>
            filter: <input value={ filter } onChange={ evt => setFilter(evt.target.value) } />
            <span>  </span>
            {
                data.loading ?
                <button disabled={ true }>Refreshing...</button> :
                <button onClick={ () => data.reload() }>Refresh</button>
            }
            {
                data.error &&
                <span style={{ color: 'red' }}> { data.error.message }</span>
            }
        </div>
        <div className="timeline-main" style={{ width, height }}
            onMouseDown={ onMouseDown } onWheel={ onWheel }>
            <Timeline rows={ rows } onMouseEnter={ onSpanEnter } onMouseLeave={ onSpanLeave } />
            { tooltip.content && <Tooltip
                onMouseEnter={ evt => onSpanEnter(null, evt) } onMouseLeave={ () => onSpanLeave() }
                content={ tooltip.content } left={ tooltip.left }
                top={ tooltip.top <= 300 ? tooltip.top + tooltip.height : undefined }
                bottom={ tooltip.top > 300 ? range.height - tooltip.top : undefined } /> }
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
