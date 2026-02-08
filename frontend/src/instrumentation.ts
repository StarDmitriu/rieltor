/**
 * Глобальные обработчики ошибок: ETIMEDOUT, ECONNRESET, NEXT_REDIRECT,
 * returnNaN (баг зависимостей), ENOENT chmod — не роняют и не заспамливают лог.
 */

// Полифилл returnNaN до загрузки остального (баг React Compiler / зависимостей)
const g = typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : ({} as any))
if (g && (g as any).returnNaN === undefined) {
	;(g as any).returnNaN = Number.NaN
}
if (typeof global !== 'undefined' && (global as any).returnNaN === undefined) {
	;(global as any).returnNaN = Number.NaN
}

const isNetworkError = (err: unknown) => {
	const code = (err as NodeJS.ErrnoException)?.code
	return code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ECONNREFUSED'
}

const isNextRedirect = (err: unknown) =>
	(err as Error)?.message === 'NEXT_REDIRECT'

const isReturnNaNRef = (err: unknown) => {
	const e = err as Error
	return e?.name === 'ReferenceError' && String(e?.message).includes('returnNaN')
}

const isChmodENOENT = (err: unknown) => {
	const e = err as NodeJS.ErrnoException
	return e?.code === 'ENOENT' && e?.syscall === 'chmod'
}

// Сокращаем спам от Next.js: один раз в N секунд по типу ошибки
const lastLog = new Map<string, number>()
const THROTTLE_MS = 5000
function shouldThrottle(key: string): boolean {
	const now = Date.now()
	const last = lastLog.get(key) ?? 0
	if (now - last < THROTTLE_MS) return true
	lastLog.set(key, now)
	return false
}

function quietLog(msg: string, key: string) {
	if (shouldThrottle(key)) return
	console.warn('[instrumentation]', msg)
}

export async function register() {
	if (process.env.NEXT_RUNTIME !== 'nodejs') return

	// Подавляем дублирующий вывод Next.js по известным ошибкам
	const origConsoleError = console.error
	console.error = (...args: unknown[]) => {
		const full = args.map(a => (a && typeof a === 'object' && 'message' in a ? (a as Error).message : String(a ?? ''))).join(' ')
		const first = args[0] as Error | string
		const code = first && typeof first === 'object' && 'code' in first ? (first as NodeJS.ErrnoException).code : ''
		if (full.includes('NEXT_REDIRECT')) return
		if (full.includes('returnNaN is not defined')) {
			quietLog('ReferenceError returnNaN (suppressed)', 'returnNaN')
			return
		}
		if (full.includes('ETIMEDOUT') || full.includes('ECONNRESET') || code === 'ETIMEDOUT') {
			quietLog('network error (suppressed)', 'network')
			return
		}
		if (full.includes('ENOENT') && full.includes('chmod')) {
			quietLog('ENOENT chmod (suppressed)', 'enoent')
			return
		}
		origConsoleError.apply(console, args)
	}

	process.on('uncaughtException', (err: unknown) => {
		if (isNextRedirect(err)) return
		if (isReturnNaNRef(err)) {
			quietLog('ReferenceError returnNaN (suppressed)', 'returnNaN')
			return
		}
		if (isNetworkError(err)) {
			const e = err as NodeJS.ErrnoException & { address?: string; port?: number }
			quietLog(`network: ${e.code} ${e.address ?? ''}:${e.port ?? ''}`, 'network')
			return
		}
		if (isChmodENOENT(err)) {
			quietLog('ENOENT chmod (suppressed)', 'enoent')
			return
		}
		origConsoleError('[uncaughtException]', (err as Error)?.message ?? err)
	})

	process.on('unhandledRejection', (reason: unknown) => {
		if (reason && typeof reason === 'object' && (reason as Error).message === 'NEXT_REDIRECT') return
		if (reason && typeof reason === 'object' && isNetworkError(reason)) {
			const e = reason as NodeJS.ErrnoException & { address?: string; port?: number }
			quietLog(`unhandledRejection network: ${e.code}`, 'network')
			return
		}
		if (reason && typeof reason === 'object' && isChmodENOENT(reason)) {
			quietLog('unhandledRejection ENOENT chmod (suppressed)', 'enoent')
			return
		}
		origConsoleError('[unhandledRejection]', String(reason))
	})
}
