import { BinaryWriter, BinaryReader } from 'google-protobuf'
import { GrpcWebClientBase, AbstractClientBase } from 'grpc-web'
import { EventIterator } from 'event-iterator'

import api from '../common/api'
import { getSrvFuncName, hookFunc, asyncCache, metaQuery, metaProto } from '../common/utils'

const TYPE_CODES = {
    bytes: 12,
    string: 9,
    number: 2,
    boolean: 8,
    void: -1,
    undefined: -1,
    null: -1,
} as { [k: string]: number }

const client = new GrpcWebClientBase({ })
function serializeBinary(fields: { [k: string]: any }, args: any) {
    const writer = new BinaryWriter()
    for (const [name, field] of Object.entries(fields)) {
        const code = TYPE_CODES[field.type]
        if (code > 0) {
            writer.writeAny(code, field.id, args[name])
        }
    }
    return writer.getResultBuffer()
}
function deserializeBinary(fields: { [k: string]: any }, bytes: Uint8Array) {
    const reader = new BinaryReader(bytes),
        obj = { } as any
    while (reader.nextField()) {
        if (reader.isEndGroup()) {
            break
        }
        const id = reader.getFieldNumber(),
            name = Object.keys(fields).find((name: string) => fields[name].id === id) || '',
            code = TYPE_CODES[fields[name].type]
        if (code > 0) {
            obj[name] = reader.readAny(code)
        }
    }
    return obj
}
function call(host: string, entry: string, args: any[], proto: any) {
    const [srvName, funcName] = getSrvFuncName(entry),
        { requestType, responseType, requestStream, responseStream } = proto.nested[srvName].methods[funcName],
        reqFields = proto.nested[requestType].fields,
        resFields = proto.nested[responseType].fields,
        request = Object.keys(reqFields).reduce((all, key, idx) => ({ ...all, [key]: args[idx] }), { }),
        url = `${host}/${srvName}/${funcName}`,
        info = new AbstractClientBase.MethodInfo(Object,
            req => serializeBinary(reqFields, req),
            bytes => deserializeBinary(resFields, bytes))
    if (requestStream) {
        throw Error('request stream not supported')
    } else if (responseStream) {
        const stream = client.serverStreaming(url, request, { }, info)
        return new EventIterator((push, pop, fail) => {
            stream
                .on('data', data => push(data.result))
                .on('end', pop)
                .on('error', err => fail({ name: 'IteratorError', ...err }))
        }, () => {
            stream.cancel()
        })
    } else {
        return new Promise((resolve, reject) => {
            const callback = (err: any, ret: any) => err ? reject(err) : resolve(ret.result)
            client.rpcCall(url, request, { }, info, callback)
        })
    }
}

const getProto = asyncCache(async (host: string) => {
    const { srv, fun } = metaQuery
    return JSON.parse(await call(host, `${srv}/${fun}`, [''], metaProto) as any)
})

function makeCall(host: string, entry: string, args: any[]) {
    // for async functions
    const then = async (resolve: Function, reject: Function) => {
        try {
            const proto = await getProto(host)
            resolve(call(host, entry, args, proto))
        } catch (err) {
            reject(err)
        }
    }
    // for async iterators
    let proxy: AsyncIterableIterator<any>
    const next = async () => {
        if (!proxy) {
            const proto = await getProto(host),
                ret = call(host, entry, args, proto) as any
            proxy = ret[Symbol.asyncIterator]()
        }
        return await proxy.next()
    }
    return { then, [Symbol.asyncIterator]: () => ({ next }) }
}

export default (host: string) => hookFunc({ } as typeof api, (...stack) => {
    const entry = stack.map(({ propKey }) => propKey).reverse().join('/')
    return (...args: any[]) => makeCall(host, entry, args)
})
