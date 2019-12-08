export async function importScript(url: string) {
    const req = await fetch(url),
        text = await req.text(),
        exp = { },
        mod = { exports: exp }
    return Function('module', 'exports', `${text};return module.exports`)(mod, exp)
}
