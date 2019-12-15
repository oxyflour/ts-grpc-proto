import { KubeConfig, CustomObjectsApi, CoreV1Api } from '@kubernetes/client-node'

const config = new KubeConfig()
config.loadFromDefault()

const crd = config.makeApiClient(CustomObjectsApi),
    core = config.makeApiClient(CoreV1Api)

const group = 'argoproj.io',
    version = 'v1alpha1',
    namespace = 'default',
    plural = 'workflows'

export interface Pod {
    metadata: {
        name: string
    }
    spec: {
        nodeName?: string
    }
}

export interface WorkerNode {
    metadata: {
        name: string
    }
    spec: {
        unschedulable: boolean
    }
    status?: {
        address: string
        status: string
    }
}

export interface Template {
    name: string
    container?: {
        command: string[]
        args: string[]
        image: string
        name: string
    }
}

export interface FlowNode {
    displayName: string
    startedAt: string
    finishedAt?: string
    name: string
    phase: string
    type: string
}

export interface Workflow {
    metadata: {
        creationTimestamp: string
        name: string
        namespace: string
        uid: string
    }
    spec: {
        entrypoint: string
        templates: Template[]
    }
    status: {
        startedAt: string
        finishedAt: string
        nodes: { [name: string]: FlowNode }
    }
}

export default {
    node: {
        async list() {
            const { body } = await core.listNode() as { body: { items: WorkerNode[] } }
            return body.items
        }
    },
    pod: {
        async list() {
            const { body } = await core.listNamespacedPod(namespace) as { body: { items: Pod[] } }
            return body.items
        }
    },
    workflow: {
        async list() {
            const { body } = await crd.listNamespacedCustomObject(
                group, version, namespace, plural) as { body: { items: Workflow[] } }
            return body.items
        }
    },
    async *st() {
        for (const i in Array(20).fill(0)) {
            yield i
            await new Promise(resolve => setTimeout(resolve, 500))
        }
    }
}
