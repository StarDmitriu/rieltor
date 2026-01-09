import Cookies from 'js-cookie'
//lib/api.ts
const BACKEND_URL =
	process.env.NEXT_PUBLIC_BACKEND_URL || '/api'

export async function apiPost(path: string, body?: any) {
	const token = Cookies.get('token')

	const res = await fetch(`${BACKEND_URL}${path}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify(body ?? {}),
	})

	const json = await res.json()
	return json
}

export async function apiPostForm(path: string, form: FormData) {
	const token = Cookies.get('token')

	const res = await fetch(`${BACKEND_URL}${path}`, {
		method: 'POST',
		headers: {
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			// ВАЖНО: Content-Type не ставим руками для FormData
		},
		body: form,
	})

	return res.json()
}

export async function apiGet(path: string) {
	const token = Cookies.get('token')

	const res = await fetch(`${BACKEND_URL}${path}`, {
		method: 'GET',
		headers: {
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		cache: 'no-store',
	})

	return res.json()
}
