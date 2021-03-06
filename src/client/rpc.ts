import { BinaryWriter, BinaryReader } from 'google-protobuf'
import { GrpcWebClientBase, AbstractClientBase } from 'grpc-web'
import { EventIterator } from 'event-iterator'

import api from '../common/api'
import { getSrvFuncName, hookFunc, asyncCache, metaQuery, metaProto } from '../common/utils'

function serializeBinary({ fields, nested }: any, args: any, writer: BinaryWriter) {
    for (const [name, field] of Object.entries(fields)) {
        const { id, type, rule, keyType } = field as any,
            repeated = rule === 'repeated',
            val = args[name]
        if (keyType) {
            if (keyType !== 'string') {
                throw Error(`key type ${keyType} not supported`)
            }
            for (const [k, v] of Object.entries(val)) {
                writer.beginSubMessage(id)
                const fields = { k: { id: 1, type: 'string' }, v: { id: 2, type } }
                serializeBinary({ fields, nested }, { k, v }, writer)
                writer.endSubMessage(id)
            }
            continue
        }
        switch (type) {
            case 'bytes':
                repeated ? writer.writeRepeatedBytes(id, val) : writer.writeBytes(id, val)
                break
            case 'string':
                repeated ? writer.writeRepeatedString(id, val) : writer.writeString(id, val)
                break
            case 'float':
                repeated ? writer.writeRepeatedFloat(id, val) : writer.writeFloat(id, val)
                break
            case 'bool':
                repeated ? writer.writeRepeatedBool(id, val) : writer.writeBool(id, val)
                break
            default:
                const sub = nested[type]
                if (sub) {
                    const cb = (val: any, writer: BinaryWriter) => serializeBinary(sub, val, writer)
                    repeated ? writer.writeRepeatedMessage(id, val, cb) : writer.writeMessage(id, val, cb)
                } else {
                    throw Error(`type ${type} not supported`)
                }
        }
    }
    return writer
}

function deserializeBinary({ fields, nested }: any, reader: BinaryReader, out = { } as any) {
    const getArr = (name: string) => out[name] as any[] || (out[name] = [])
    while (reader.nextField()) {
        if (reader.isEndGroup()) {
            break
        }
        const id = reader.getFieldNumber(),
            name = Object.keys(fields).find((name: string) => fields[name].id === id) || '',
            { type, rule, keyType } = fields[name],
            repeated = rule === 'repeated'
        if (keyType) {
            out[name] = out[name] || { }
            if (keyType !== 'string') {
                throw Error(`key type ${keyType} not supported`)
            }
            reader.readMessage(out[name], (map, reader) => {
                const fields = { k: { id: 1, type: 'string' }, v: { id: 2, type } },
                    out = deserializeBinary({ fields, nested }, reader)
                map[out.k] = out.v
            })
            continue
        }
        switch (type) {
            case 'bytes':
                repeated ? getArr(name).push(reader.readBytes()) : (out[name] = reader.readBytes())
                break
            case 'string':
                repeated ? getArr(name).push(reader.readString()) : (out[name] = reader.readString())
                break
            case 'float':
                out[name] = repeated ? reader.readPackedFloat() : reader.readFloat()
                break
            case 'bool':
                out[name] = repeated ? reader.readPackedBool() : reader.readBool()
                break
            default:
                const sub = nested[type]
                if (sub) {
                    const val = { }
                    reader.readMessage(val, (val, reader) => deserializeBinary(sub, reader, val))
                    repeated ? getArr(name).push(val) : (out[name] = val)
                } else {
                    throw Error(`unknown type ${type}`)
                }
        }
    }
    return out
}

const client = new GrpcWebClientBase({ }),
    cache = { } as { [key: string]: AbstractClientBase.MethodInfo<any, any> }
function call(host: string, entry: string, args: any[], proto: any) {
    const [srvName, funcName] = getSrvFuncName(entry),
        { requestType, responseType, requestStream, responseStream } = proto.nested[srvName].methods[funcName],
        reqType = proto.nested[requestType],
        resType = proto.nested[responseType],
        request = Object.keys(reqType.fields).reduce((all, key, idx) => ({ ...all, [key]: args[idx] }), { }),
        url = `${host}/${srvName}/${funcName}`,
        info = cache[url] || (cache[url] = new AbstractClientBase.MethodInfo(Object,
            req => serializeBinary(reqType, req, new BinaryWriter()).getResultBuffer(),
            bytes => deserializeBinary(resType, new BinaryReader(bytes))))
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
    const ret = (val?: any) => {
        return proxy && proxy.return && proxy.return(val)
    }
    return { then, [Symbol.asyncIterator]: () => ({ next }), return: ret }
}

export default (host: string) => hookFunc({ } as typeof api, (...stack) => {
    const entry = stack.map(({ propKey }) => propKey).reverse().join('/')
    return (...args: any[]) => makeCall(host, entry, args)
})
