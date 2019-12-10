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
        return [{
            a: 'maybe ok',
            b: [0, 1, 2],
            c: [true, false],
            d: ['a', 'b', 'c'],
            e: [Buffer.from('A'), Buffer.from('B')]
        }]
    },
    async *st() {
        for (const i in Array(20).fill(0)) {
            yield i
            await new Promise(resolve => setTimeout(resolve, 500))
        }
    }
}
