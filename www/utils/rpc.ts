import api from '../../common/api.js'
import { getSrvFuncName, hookFunc, asyncCache } from '../../common/utils.js'
import { importScript } from '../utils/loader.js'
import { EventIterator } from '../../node_modules/event-iterator/src/event-iterator.js'

const TYPE_CODES = {
    bytes: 12,
    string: 9,
    number: 2,
    boolean: 8,
    void: -1,
    undefined: -1,
    null: -1,
} as { [k: string]: number }

const init = asyncCache(async () => {
    const { BinaryWriter, BinaryReader } = await importScript('../node_modules/google-protobuf/google-protobuf.js') as typeof import('google-protobuf'),
        { GrpcWebClientBase, AbstractClientBase } = await importScript('../node_modules/grpc-web/index.js') as typeof import('grpc-web'),
        metaReq = await fetch('../../../proto.json'),
        meta = { proto: await metaReq.json(), service: '_query_proto' },
        client = new GrpcWebClientBase({ })
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
            })
        } else {
            return new Promise((resolve, reject) => {
                const callback = (err: any, ret: any) => err ? reject(err) : resolve(ret.result)
                client.rpcCall(url, request, { }, info, callback)
            })
        }
    }
    return { call, meta }
})

const getCall = asyncCache(async (host: string) => {
    const { call, meta } = await init(),
        proto = JSON.parse(await call(host, 'query_proto/' + meta.service, [''], meta.proto) as any)
    return (entry: string, args: any[]) => call(host, entry, args, proto)
})

function makeCall(host: string, entry: string, args: any[]) {
    // for async functions
    const then = async (resolve: Function, reject: Function) => {
        try {
            const call = await getCall(host)
            resolve(call(entry, args))
        } catch (err) {
            reject(err)
        }
    }
    // for async iterators
    let proxy: AsyncIterableIterator<any>
    const next = async () => {
        if (!proxy) {
            const call = await getCall(host),
                ret = call(entry, args) as any
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
