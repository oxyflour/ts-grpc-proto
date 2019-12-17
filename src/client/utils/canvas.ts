import { FlowNode, Workflow, Pod } from '../../common/api'
import { startTimeOfDay, randint, memo } from '../../common/utils'

export interface TimeRange {
    start: number
    end: number
    top: number
    width: number
    height: number
    t2w: number
    w2t: number
}

export interface Span {
    start: number
    end: number
    left: number
    width: number
    top: number
    height: number
    name: string
    index: number
    node: FlowNode
}

export interface TimelineRow {
    spans: Span[]
    worker: string
}

export const timelineHead = 20,
    timelineSpanHeight = 20

export const TIME = {
    minute: 60 * 1000,
    hour: 3600 * 1000,
    day: 3600 * 1000 * 24,
    week: 7 * 3600 * 1000 * 24,
}

export const GRIDS = [
    [TIME.minute *  5, TIME.minute],
    [TIME.minute * 10, TIME.minute * 2],
    [TIME.minute * 30, TIME.minute * 5],
    [TIME.hour,        TIME.minute * 10],
    [TIME.hour * 2,    TIME.minute * 30],
    [TIME.hour * 6,    TIME.hour],
    [TIME.hour * 12,   TIME.hour * 2],
    [TIME.day,         TIME.hour * 4],
]

const getFlowColor = memo((_: number) => `hsl(${randint(360)}, 76%, 69%)`)

export function calcSpanList(range: TimeRange, pods: Pod[], flows: Workflow[], filter: string) {
    const workers = { } as { [name: string]: string }
    for (const pod of pods) {
        workers[pod.metadata.name] = pod.spec.nodeName || ''
    }

    const rows = [ ] as TimelineRow[],
        now = Date.now(),
        re = filter && new RegExp(filter)
    for (const [index, flow] of flows.entries()) {
        for (const [name, node] of Object.entries(flow.status.nodes)) {
            if (node.type === 'Pod' && node.startedAt && (!re || re.test(node.name))) {
                const worker = workers[node.id] || '',
                    start = new Date(node.startedAt).getTime(),
                    end = node.finishedAt ? new Date(node.finishedAt).getTime() : now + 20 * range.w2t,
                    left = (start - range.start) * range.t2w,
                    width = Math.max((end - start) * range.t2w, 10),
                    spans = rows.find(item => item.worker === worker &&
                        item.spans.every(span => span.end < start || span.start > start + width * range.w2t))
                if (left < range.width && left + width > 0) {
                    const selected = spans || (rows.push({ spans: [], worker }), rows[rows.length - 1])
                    selected.spans.push({ start, end, left, width, name, index, node, top: 0, height: 0 })
                }
            }
        }
    }

    let spanStartHeight = timelineHead + range.top
    rows.sort((a, b) => a.worker.localeCompare(b.worker))
    for (const { spans } of rows) {
        for (const span of spans) {
            span.top = spanStartHeight
            span.height = timelineSpanHeight
        }
        spanStartHeight += timelineSpanHeight
    }
    return rows
}

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

function drawLabels(dc: CanvasRenderingContext2D, { start, end, t2w, height }: TimeRange) {
    const begin = startTimeOfDay(start),
        [timeSpan] = GRIDS.find(([span]) => span * t2w > 200) || GRIDS[GRIDS.length - 1]
    for (let time = begin; time < end; time += timeSpan) {
        const pos = (time - start) * t2w,
            date = new Date(time),
            timeString = [date.getHours(), date.getMinutes()]
                .map(val => `${val}`.padStart(2, '0')).join(':'),
            text = timeString === '00:00' ? date.toDateString() + ' ' + timeString : timeString
        dc.fillText(text, pos + 5, timelineHead - 5, timeSpan * t2w - 10)
    }
}

function drawBackground(dc: CanvasRenderingContext2D, { start, end, t2w, height }: TimeRange) {
    const begin = startTimeOfDay(start),
        [timeSpan, subTimeSpan] = GRIDS.find(([span]) => span * t2w > 200) || GRIDS[GRIDS.length - 1]
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
}

export function drawSpanList(dc: CanvasRenderingContext2D, range: TimeRange, rows: TimelineRow[]) {
    dc.clearRect(0, 0, range.width, range.height)
    dc.save()
    let prevWorker = 'null',
        prevWorkerBg = '#eee'
    for (const { spans: [first], worker } of rows) {
        if (first) {
            if (prevWorker !== worker) {
                prevWorker = worker
                prevWorkerBg = prevWorkerBg === '#eee' ? '#fff' : '#eee'
            }
            if (first.top < range.height && first.top + first.height > 0) {
                dc.fillStyle = prevWorkerBg
                dc.fillRect(0, first.top, range.width, first.height)
            }
        }
    }
    dc.restore()

    drawBackground(dc, range)

    dc.save()
    for (const { spans } of rows) {
        for (const { left, width, top, height, index } of spans) {
            if (top < range.height && top + height > 0) {
                dc.fillStyle = getFlowColor(index)
                dc.fillRect(left + 1, top + 1, width - 2, height - 2)
            }
        }
    }
    dc.restore()

    const now = Date.now()
    dc.save()
    dc.beginPath()
    dc.moveTo((now - range.start) * range.t2w, 0)
    dc.lineTo((now - range.start) * range.t2w, range.height)
    dc.strokeStyle = 'rgba(255, 128, 128, 0.5)'
    dc.stroke()
    dc.restore()

    dc.save()
    let prev = 'null'
    for (const { spans: [first], worker } of rows) {
        if (prev !== worker && first) {
            dc.fillStyle = '#888'
            dc.fillText((prev = worker) || '<Pending>', 5, first.top + first.height - 5)
        }
    }
    dc.restore()

    drawLabels(dc, range)
}
