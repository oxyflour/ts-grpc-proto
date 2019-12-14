import React, { useReducer, useEffect, useState, useRef } from 'react'
import ReactDOM from 'react-dom'
import { HashRouter, Route, Switch } from 'react-router-dom'
import { TooltipHost } from 'office-ui-fabric-react/lib/Tooltip'
import { useId } from '@uifabric/react-hooks'

import buildRPC from './rpc'
import { useAsyncEffect, buildRedux, withMouseDown } from './effect'
import { Workflow, FlowNode } from '../common/api'
import { sleep, debounce } from '../common/utils'

import './index.less'

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

interface TimeRange {
    start: number
    end: number
    width: number
    height: number
    t2w: number
    w2t: number
}

function dayStartOf(time: number) {
    const date = new Date(time)
    date.setHours(0, 0, 0, 0)
    return date.getTime()
}

const ONE_MINITE = 60 * 1000,
    ONE_HOUR = 60 * ONE_MINITE,
    ONE_DAY = ONE_HOUR * 24,
    ONE_WEEK = ONE_DAY * 7

const durations = [
    [10 * ONE_MINITE, 2 * ONE_MINITE],
    [30 * ONE_MINITE, 5 * ONE_MINITE],
    [ONE_HOUR, 10 * ONE_MINITE],
    [2 * ONE_HOUR, 30 * ONE_MINITE],
    [6 * ONE_HOUR, ONE_HOUR],
    [12 * ONE_HOUR, 2 * ONE_HOUR],
    [ONE_DAY, 4 * ONE_HOUR],
]

const timelineHead = 20,
    timelineTop = 40,
    timelineSpanHeight = 20

function drawVerticalGrids(dc: CanvasRenderingContext2D, positions: number[][], style: string) {
    dc.save()
    dc.beginPath()
    for (const [pos, from, to] of positions) {
        dc.moveTo(pos, from)
        dc.lineTo(pos, to)
    }
    dc.strokeStyle = style
    dc.stroke()
    dc.restore()
}

function drawBackground(dc: CanvasRenderingContext2D, { start, end, t2w, width, height }: TimeRange) {
    const now = Date.now()
    dc.clearRect(0, 0, width, height)
    dc.save()
    dc.fillStyle = '#eee'
    dc.fillRect((now - start) * t2w, 0, (end - start) * t2w, height)
    dc.restore()

    // background
    const begin = dayStartOf(start),
        [timeSpan, subTimeSpan] = durations.find(([span]) => span * t2w > 200) || durations[durations.length - 1]
    const subTickPos = [ ] as number[][]
    for (let time = begin; time < end; time += subTimeSpan) {
        subTickPos.push([(time - start) * t2w, timelineHead, height])
    }
    drawVerticalGrids(dc, subTickPos, '#ddd')
    const tickPos = [ ] as number[][]
    for (let time = begin; time < end; time += timeSpan) {
        tickPos.push([(time - start) * t2w, 0, height])
    }
    drawVerticalGrids(dc, tickPos, '#666')

    // labels
    for (let time = begin; time < end; time += timeSpan) {
        const pos = (time - start) * t2w,
            date = new Date(time),
            timeString = [date.getHours(), date.getMinutes()]
                .map(val => `${val}`.padStart(2, '0')).join(':'),
            text = timeString === '00:00' ? date.toDateString() + ' ' + timeString : timeString
        dc.fillText(text, pos + 5, timelineHead - 5, timeSpan * t2w - 10)
    }
}

const colorCache = [ ] as string[]
function getColorFromCache(index: number) {
    return colorCache[index] || (colorCache[index] = `hsl(${Math.floor(Math.random() * 360)}, 76%, 69%)`)
}

export interface Span {
    start: number
    end: number
    left: number
    width: number
    name: string
    index: number
    node: FlowNode
}

function calcSpanList(range: TimeRange, flows: Workflow[]) {
    const spanList = [ ] as Span[][]
    for (const [index, flow] of flows.entries()) {
        for (const [name, node] of Object.entries(flow.status.nodes)) {
            if (node.type === 'Pod' && node.startedAt) {
                const start = new Date(node.startedAt).getTime(),
                    end = node.finishedAt ? new Date(node.finishedAt).getTime() : range.end,
                    spans = spanList.find(spans => spans.every(span => span.end < start || span.start > end)),
                    selected = spans || (spanList.push([]), spanList[spanList.length - 1]),
                    left = (start - range.start) * range.t2w,
                    width = Math.max((end - start) * range.t2w, 10)
                selected.push({ start, end, left, width, name, index, node })
            }
        }
    }
    return spanList
}

function drawFlows(dc: CanvasRenderingContext2D, range: TimeRange, flows: Workflow[]) {
    dc.save()
    let spanStartHeight = timelineHead
    for (const spans of calcSpanList(range, flows)) {
        for (const span of spans) {
            dc.fillStyle = getColorFromCache(span.index)
            dc.fillRect(span.left, spanStartHeight + 1, span.width, timelineSpanHeight - 2)
        }
        spanStartHeight += timelineSpanHeight
    }
    dc.restore()
}

function Flows({ range, flows }: { range: TimeRange, flows: Workflow[] }) {
    const spanList = calcSpanList(range, flows),
        id = useId('flow')
    return <div>
    {
        spanList.map((spans, index1) => <div key={ index1 } style={{ height: timelineSpanHeight }}>
        {
            spans.map((span, index) => <TooltipHost key={ index }
                content={
                    <p>
                        <b>Name</b>: { span.name }<br />
                        <b>Phase</b>: { span.node.phase }
                    </p>
                }
                calloutProps={{ target: `#${id}-${index1}-${index}` }}>
                <div id={ `${id}-${index1}-${index}` } className="flow-span" style={{
                    left: span.left - 1,
                    width: span.width,
                    height: timelineSpanHeight - 2,
                }}></div>
            </TooltipHost>)
        }
        </div>)
    }
    </div>
}

function Timeline() {
    const now = Date.now(),
        [[start, end], setRange] = useState([now - ONE_WEEK, now + ONE_DAY]),
        [showType, setShowType] = useState('flow'),
        cvRef = useRef<HTMLCanvasElement>(null),
        width = window.innerWidth,
        height = window.innerHeight - timelineTop,
        dpi = window.devicePixelRatio,
        t2w = width / (end - start),
        w2t = 1 / t2w,
        range = { start, end, width, height, t2w, w2t }

    const workflows = useAsyncEffect(async () => {
        while (showType === 'flow') {
            try {
                return await rpc.workflow.list()
            } catch (err) {
                console.error(err)
                await sleep(1000)
            }
        }
        return []
    }, [showType])

    const [flowProps, setFlowProps] = useState({ flows: [] as Workflow[], range }),
        setFlowsDebounced = debounce(setFlowProps, 500)

    useEffect(() => {
        const cv = cvRef.current,
            dc = cv && cv.getContext('2d'),
            flows = workflows.value || []
        if (cv && dc) {
            if (!(cv as any).dpiScaled) {
                (cv as any).dpiScaled = dpi
                dc.scale(dpi, dpi)
            }
            drawBackground(dc, range)
            if (showType === 'flow') {
                drawFlows(dc, range, flows)
            }
        }
        setFlowsDebounced({ flows, range })
    }, [start, end, !!workflows.value])

    function onWheel(evt: React.WheelEvent) {
        const cv = cvRef.current
        if (cv) {
            const { left, right, width } = cv.getBoundingClientRect(),
                delta = (end - start) * evt.deltaY * 0.01,
                f1 = (evt.clientX - left) / width,
                f2 = (right - evt.clientX) / width,
                val = end - start + delta
            if (val > 30 * ONE_MINITE && val < ONE_WEEK) {
                setRange([start - delta * f1, end + delta * f2])
            }
        }
    }

    const onMouseDown = (evt: React.MouseEvent) => withMouseDown(evt as any, (evt, init) => {
        const delta = (evt.clientX - init.clientX) * w2t
        setRange([start - delta, end - delta])
    })

    return <>
        <div style={{ height: timelineTop }}>
            <select value={ showType } onChange={ evt => setShowType(evt.target.value) }>
                <option value="flow">Show Flow</option>
                <option value="node">Show Node</option>
            </select>
        </div>
        <div className="timeline-main"
                style={{ width, height, marginTop: timelineHead, marginBottom: -timelineHead }}
            onMouseDown={ onMouseDown } onWheel={ onWheel }>
            {
                workflows.loading ?
                    <div>loading...</div> :
                workflows.error ?
                    <div>error: { workflows.error.message }</div> :
                    null
            }
            <Flows flows={ flowProps.flows } range={ flowProps.range } />
        </div>
        <canvas className="timeline-bg" style={{ width, height }}
            width={ width * dpi } height={ height * dpi } ref={ cvRef } />
    </>
}

ReactDOM.render(<HashRouter>
    <Switch>
        <Route path="/0">
            <Timeline />
        </Route>
        <Route path="/1">
            <Logger />
        </Route>
    </Switch>
</HashRouter>, document.getElementById('main'))
