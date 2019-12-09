import fs from 'fs'
import ts from 'typescript'
import path from 'path'
import grpc, { Server, ServerCredentials, loadObject } from 'grpc'
import { Root } from 'protobufjs'
import { Readable, Writable } from 'stream'
import EventIterator from 'event-iterator'
import { getProtoObject } from './parser'
import { wrapFunc, AsyncFunction, getSrvFuncName } from '../common/utils'

function loadTsConfig(file: string) {
    const compilerOptionsJson = fs.readFileSync(file, 'utf8'),
        { config, error } = ts.parseConfigFileTextToJson('tsconfig.json', compilerOptionsJson)
    if (error) {
        throw Error(`load config from '${file}' failed`)
    }
    const basePath: string = process.cwd(),
        settings = ts.convertCompilerOptionsFromJson(config.compilerOptions, basePath)
    if (settings.errors.length) {
        for (const error of settings.errors) {
            console.error(error)
        }
        throw Error(`parse config in '${file}' failed`)
    }
    return settings.options
}

function makeAsyncIterator(stream: Readable) {
    let callback: (data: any) => any
    return new EventIterator(
        (push, pop, fail) => stream
            .on('data', callback = data => push(data.result))
            .on('end', pop)
            .on('error', fail),
        (_, pop, fail) => stream
            .removeListener('data', callback)
            .removeListener('end', pop)
            .removeListener('error', fail),
    )
}

async function startAsyncIterator(stream: Writable, iter: AsyncIterableIterator<any>) {
    for await (const result of iter) {
        stream.write({ result })
    }
    stream.end()
}

function makeService(entry: string, func: any, proto: any) {
    const [srvName, funcName] = getSrvFuncName(entry),
        { requestType, requestStream, responseStream } = proto.nested[srvName].methods[funcName],
        fields = proto.nested[requestType].fields,
        argKeys = Object.keys(fields).sort((a, b) => fields[a].id - fields[b].id),
        makeArgs = (request: any) => argKeys.map(key => request[key])
    let wrapper: AsyncFunction<any>
    if (requestStream && responseStream) {
        wrapper = (stream: grpc.ServerDuplexStream<any, any>) => {
            const arg = makeAsyncIterator(stream),
                iter = func(arg) as AsyncIterableIterator<any>
            return startAsyncIterator(stream, iter)
        }
    } else if (requestStream) {
        wrapper = async (stream: grpc.ServerReadableStream<any>, callback: grpc.sendUnaryData<any>) => {
            try {
                const arg = makeAsyncIterator(stream),
                    result = await func(arg) as Promise<any>
                callback(null, { result });
            }
            catch (error) {
                callback(error, null);
            }
        }
    } else if (responseStream) {
        wrapper = (stream: grpc.ServerWriteableStream<any>) => {
            const iter = func(...makeArgs(stream.request)) as AsyncIterableIterator<any>
            return startAsyncIterator(stream, iter)
        }
    } else {
        wrapper = async (call: grpc.ServerUnaryCall<any>, callback: grpc.sendUnaryData<any>) => {
            try {
                const result = await func(...makeArgs(call.request)) as Promise<any>
                return callback(null, { result });
            }
            catch (error) {
                return callback(error, null);
            }
        }
    }
    return { srvName, funcName, wrapper }
}

function makeServerImpl(proto: any, api: any) {
    const root = Root.fromJSON(proto),
        desc = loadObject(root) as any,
        impl = { } as any
    wrapFunc(api, (...stack) => {
        const entry = stack.map(({ propKey }) => propKey).reverse().join('/'),
            [{ receiver, target }] = stack,
            func = target.bind(receiver),
            { srvName, funcName, wrapper } = makeService(entry, func, proto),
            srv = impl[srvName] || (impl[srvName] = { })
        srv[funcName] = wrapper
    })
    return { desc, impl }
}

const meta = {
    proto: require(path.join(__dirname, '..', '..', 'proto.json')),
    service: '_query_proto',
}

async function serve(file: string, opt: string, addr='0.0.0.0:5000') {
    const config = loadTsConfig(opt)
    require('ts-node').register(config)
    const api = require(file).default,
        proto = getProtoObject(file, api, config),
        { desc, impl } = makeServerImpl(proto, api),
        server = new Server()
    for (const name in impl) {
        server.addService(desc[name].service, impl[name])
    }
    const metaFunc = async (entry: string) => JSON.stringify(proto),
        metaSrv = makeServerImpl(meta.proto, { query_proto: { [meta.service]: metaFunc } })
    server.addService(metaSrv.desc.srv_query_proto.service, metaSrv.impl.srv_query_proto)
    server.bind(addr, ServerCredentials.createInsecure())
    server.start()
}

const dir = path.join(__dirname, '..', '..')
serve(
    path.join(dir, 'common', 'api'),
    path.join(dir, 'app', 'tsconfig.json'))

