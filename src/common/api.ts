export default {
    a: {
        async it() {
            return 'ok'
        },
        async it2() {
            return 'not ok'
        }
    },
    async it3() {
        return {
            a: 'maybe ok'
        }
    },
    async *st() {
        for (const i in Array(10).fill(0)) {
            yield i
            await new Promise(resolve => setTimeout(resolve, 500))
        }
    }
}
