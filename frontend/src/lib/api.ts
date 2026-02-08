import Cookies from 'js-cookie'

const BACKEND_URL =
	process.env.NEXT_PUBLIC_BACKEND_URL || '/api'

const DEFAULT_TIMEOUT_MS = 20_000

function fetchWithTimeout(
	url: string,
	init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
	const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchInit } = init
	const controller = new AbortController()
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
	return fetch(url, {
		...fetchInit,
		signal: controller.signal,
	}).finally(() => clearTimeout(timeoutId))
}

function isNetworkError(err: unknown): boolean {
	const e = err as { code?: string; name?: string }
	return (
		e?.code === 'ETIMEDOUT' ||
		e?.code === 'ECONNRESET' ||
		e?.code === 'ECONNREFUSED' ||
		e?.name === 'AbortError'
	)
}

export class ApiError extends Error {
	constructor(
		message: string,
		public code: string,
		public status?: number,
	) {
		super(message)
		this.name = 'ApiError'
	}
}

export async function apiPost(path: string, body?: unknown, opts?: { timeoutMs?: number }) {
	const token = Cookies.get('token')
	try {
		const res = await fetchWithTimeout(`${BACKEND_URL}${path}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...(token ? { Authorization: `Bearer ${token}` } : {}),
			},
			body: JSON.stringify(body ?? {}),
			timeoutMs: opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		})
		const json = await res.json().catch(() => ({}))
		if (!res.ok) {
			throw new ApiError(
				(json?.message as string) || res.statusText || 'Ошибка запроса',
				'HTTP',
				res.status,
			)
		}
		return json
	} catch (err) {
		if (err instanceof ApiError) throw err
		if (isNetworkError(err)) {
			throw new ApiError(
				'Таймаут или нет связи с сервером. Попробуйте позже.',
				(err as NodeJS.ErrnoException).code ?? 'NETWORK',
			)
		}
		throw err
	}
}

export async function apiPostForm(path: string, form: FormData, opts?: { timeoutMs?: number }) {
	const token = Cookies.get('token')
	try {
		const res = await fetchWithTimeout(`${BACKEND_URL}${path}`, {
			method: 'POST',
			headers: {
				...(token ? { Authorization: `Bearer ${token}` } : {}),
			},
			body: form,
			timeoutMs: opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		})
		const json = await res.json().catch(() => ({}))
		if (!res.ok) {
			throw new ApiError(
				(json?.message as string) || res.statusText || 'Ошибка запроса',
				'HTTP',
				res.status,
			)
		}
		return json
	} catch (err) {
		if (err instanceof ApiError) throw err
		if (isNetworkError(err)) {
			throw new ApiError(
				'Таймаут или нет связи с сервером. Попробуйте позже.',
				(err as NodeJS.ErrnoException).code ?? 'NETWORK',
			)
		}
		throw err
	}
}

export async function apiGet(path: string, opts?: { timeoutMs?: number }) {
	const token = Cookies.get('token')
	try {
		const res = await fetchWithTimeout(`${BACKEND_URL}${path}`, {
			method: 'GET',
			headers: {
				...(token ? { Authorization: `Bearer ${token}` } : {}),
			},
			cache: 'no-store',
			timeoutMs: opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		})
		const json = await res.json().catch(() => ({}))
		if (!res.ok) {
			throw new ApiError(
				(json?.message as string) || res.statusText || 'Ошибка запроса',
				'HTTP',
				res.status,
			)
		}
		return json
	} catch (err) {
		if (err instanceof ApiError) throw err
		if (isNetworkError(err)) {
			throw new ApiError(
				'Таймаут или нет связи с сервером. Попробуйте позже.',
				(err as NodeJS.ErrnoException).code ?? 'NETWORK',
			)
		}
		throw err
	}
}
