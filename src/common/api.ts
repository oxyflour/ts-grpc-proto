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
    finishedAt: string
    name: string
    phase: string
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
        finishedAt: string
        nodes: { [name: string]: FlowNode }
    }
}

export interface WorkflowResponse {
    body: {
        items: Workflow[]
    }
}

export default {
    workflow: {
        async list(a: { [k: string]: string }) {
            console.log(a)
            /*
            const { body } = await api.listNamespacedCustomObject(group, version, namespace, plural) as WorkflowResponse
            console.log(JSON.stringify(body.items, null, 2))
            */
            return { a: 'c', b: 'd' } as { [k: string]: string }
        }
    },
    async *st() {
        for (const i in Array(20).fill(0)) {
            yield i
            await new Promise(resolve => setTimeout(resolve, 500))
        }
    }
}
