'use client'
//frontend/src/components/TelegramConnect.tsx
import { useEffect, useRef, useState } from 'react'

type TgStatus =
	| 'not_connected'
	| 'awaiting_code'
	| 'awaiting_password'
	| 'connected'
	| 'error'

type StatusResp = {
	success: boolean
	status: TgStatus
	lastError?: string | null
}

export function TelegramConnect({ userId }: { userId: string }) {
	const backendUrl = 'http://localhost:3000'

	const [status, setStatus] = useState<TgStatus>('not_connected')
	const [code, setCode] = useState('')
	const [password, setPassword] = useState('')
	const [errorText, setErrorText] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)

	const pollRef = useRef<number | null>(null)

	const stopPolling = () => {
		if (pollRef.current) {
			window.clearInterval(pollRef.current)
			pollRef.current = null
		}
	}

	const loadStatus = async () => {
		try {
			const res = await fetch(`${backendUrl}/telegram/status/${userId}`, {
				cache: 'no-store',
			})
			const data: StatusResp = await res.json()

			if (!data?.success) return
			setStatus(data.status)
			setErrorText(data.lastError ?? null)

			// стопаем поллинг на финальных
			if (
				data.status === 'connected' ||
				data.status === 'not_connected' ||
				data.status === 'error'
			) {
				stopPolling()
				setLoading(false)
			}
		} catch {
			setErrorText('Не удалось получить статус Telegram')
		}
	}

	const startPolling = () => {
		if (pollRef.current) return
		pollRef.current = window.setInterval(() => loadStatus(), 1200)
	}

	const startConnect = async () => {
		setLoading(true)
		setErrorText(null)
		setCode('')
		setPassword('')
		try {
			await fetch(`${backendUrl}/telegram/start`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId }),
			})
		} catch {
			setErrorText('Не удалось начать подключение. Проверь бэкенд.')
			setLoading(false)
			return
		}

		await loadStatus()
		startPolling()
		setLoading(false)
	}

	const confirmCode = async () => {
		if (!code.trim()) return
		setLoading(true)
		setErrorText(null)

		try {
			const res = await fetch(`${backendUrl}/telegram/confirm-code`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId, code: code.trim() }),
			})
			const data = await res.json().catch(() => ({}))

			if (!data?.success) {
				setErrorText(
					data?.error || data?.message || 'Ошибка подтверждения кода'
				)
			}

			setCode('')
			await loadStatus()
			startPolling()
		} catch {
			setErrorText('Ошибка сети при подтверждении кода')
		} finally {
			setLoading(false)
		}
	}

	const confirmPassword = async () => {
		if (!password.trim()) return
		setLoading(true)
		setErrorText(null)

		try {
			const res = await fetch(`${backendUrl}/telegram/confirm-password`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId, password: password.trim() }),
			})
			const data = await res.json().catch(() => ({}))

			if (!data?.success) {
				setErrorText(data?.error || data?.message || 'Ошибка 2FA пароля')
			}

			setPassword('')
			await loadStatus()
			startPolling()
		} catch {
			setErrorText('Ошибка сети при вводе 2FA пароля')
		} finally {
			setLoading(false)
		}
	}

	// “Начать заново” = disconnect
	const restart = async () => {
		setLoading(true)
		setErrorText(null)
		setCode('')
		setPassword('')

		try {
			await fetch(`${backendUrl}/telegram/disconnect`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId }),
			})
		} catch {
			// даже если упало — просто обновим статус
		}

		await loadStatus()
		setLoading(false)
	}

	useEffect(() => {
		loadStatus().then(() => {
			startPolling()
		})
		return () => stopPolling()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [userId])

	return (
		<div
			style={{
				border: '1px solid #eee',
				borderRadius: 12,
				padding: 16,
				marginTop: 16,
			}}
		>
			<h2 style={{ marginTop: 0 }}>Telegram</h2>

			<div style={{ marginBottom: 8 }}>
				<strong>Статус:</strong> {status}
			</div>

			{errorText ? (
				<div style={{ color: 'red', marginBottom: 10, fontSize: 13 }}>
					{errorText}
				</div>
			) : null}

			<div style={{ background: '#F7E28C', borderRadius: 12, padding: 14 }}>
				{status === 'connected' ? (
					<div
						style={{
							display: 'flex',
							justifyContent: 'space-between',
							gap: 12,
							alignItems: 'center',
						}}
					>
						<div>
							<strong>Telegram подключён ✅</strong>
						</div>
						<button
							onClick={restart}
							disabled={loading}
							style={{ padding: '8px 12px' }}
						>
							Отключить
						</button>
					</div>
				) : status === 'awaiting_code' ? (
					<div
						style={{
							display: 'flex',
							gap: 10,
							alignItems: 'center',
							justifyContent: 'center',
							flexWrap: 'wrap',
						}}
					>
						<div
							style={{ width: '100%', textAlign: 'center', marginBottom: 6 }}
						>
							Введите код из Telegram/SMS:
						</div>
						<input
							value={code}
							onChange={e => setCode(e.target.value)}
							placeholder='12345'
							style={{ padding: '8px 10px', minWidth: 220 }}
						/>
						<button
							onClick={confirmCode}
							disabled={loading || code.trim().length < 3}
							style={{ padding: '8px 12px' }}
						>
							Подтвердить
						</button>

						<button
							onClick={restart}
							disabled={loading}
							style={{ padding: '8px 12px' }}
							title='Сбросить текущий код и запросить заново'
						>
							Отправить код ещё раз
						</button>
					</div>
				) : status === 'awaiting_password' ? (
					<div
						style={{
							display: 'flex',
							gap: 10,
							alignItems: 'center',
							justifyContent: 'center',
							flexWrap: 'wrap',
						}}
					>
						<div
							style={{ width: '100%', textAlign: 'center', marginBottom: 6 }}
						>
							Нужен пароль 2FA:
						</div>
						<input
							type='password'
							value={password}
							onChange={e => setPassword(e.target.value)}
							placeholder='пароль 2FA'
							style={{ padding: '8px 10px', minWidth: 260 }}
						/>
						<button
							onClick={confirmPassword}
							disabled={loading || password.trim().length < 2}
							style={{ padding: '8px 12px' }}
						>
							Подтвердить
						</button>

						<button
							onClick={restart}
							disabled={loading}
							style={{ padding: '8px 12px' }}
						>
							Начать заново
						</button>
					</div>
				) : (
					<div style={{ textAlign: 'center' }}>
						<button
							onClick={startConnect}
							disabled={loading}
							style={{ padding: '10px 16px' }}
						>
							{loading ? 'Запуск…' : 'Подключить Telegram'}
						</button>
						<div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
							Код придёт в Telegram/SMS на номер из <code>users.phone</code>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}
