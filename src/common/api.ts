import { KubeConfig, CustomObjectsApi } from '@kubernetes/client-node'

const config = new KubeConfig()
config.loadFromDefault()
const api = config.makeApiClient(CustomObjectsApi)

const group = 'argoproj.io',
    version = 'v1alpha1',
    namespace = 'default',
    plural = 'workflows'

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
    workflow: {
        async list() {
            const { body } = await api.listNamespacedCustomObject(
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
