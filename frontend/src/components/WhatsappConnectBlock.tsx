'use client'
import './WhatsappConnectBlock.css'
import { useEffect, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { WhatsappLinkingSteps } from './WhatsappLinkingSteps'

type WhatsappStatus =
	| 'not_connected'
	| 'connecting'
	| 'pending_qr'
	| 'connected'
	| 'error'

interface StatusResponse {
	success: boolean
	status?: {
		status: WhatsappStatus
		qr?: string
		lastError?: string
	}
	message?: string
}

export function WhatsappConnectBlock({ userId }: { userId: string }) {
	const backendUrl =
		process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'

	const [status, setStatus] = useState<WhatsappStatus>('not_connected')
	const [qr, setQr] = useState<string | null>(null)
	const [errorText, setErrorText] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)

	// чтобы не плодить интервалы и не ловить "залипание"
	const pollRef = useRef<number | null>(null)

	const stopPolling = () => {
		if (pollRef.current) {
			window.clearInterval(pollRef.current)
			pollRef.current = null
		}
	}

	const applyStatus = (payload?: StatusResponse['status']) => {
		if (!payload) return
		setStatus(payload.status)
		setQr(payload.qr ?? null)
		setErrorText(payload.lastError ?? null)

		// если пришли финальные статусы — остановим поллинг
		if (
			payload.status === 'connected' ||
			payload.status === 'error' ||
			payload.status === 'not_connected'
		) {
			stopPolling()
			setLoading(false)
		}

		// если увидели QR — тоже можно убрать "loading"
		if (payload.status === 'pending_qr' && payload.qr) {
			setLoading(false)
		}
	}

	const loadStatus = async () => {
		try {
			const res = await fetch(`${backendUrl}/whatsapp/status/${userId}`, {
				cache: 'no-store',
			})
			const data: StatusResponse = await res.json()
			if (data.success) applyStatus(data.status)
		} catch (e) {
			// сеть упала — не убиваем UI, просто покажем ошибку
			setErrorText('Не удалось получить статус WhatsApp')
		}
	}

	const startPolling = () => {
		// уже идет
		if (pollRef.current) return

		pollRef.current = window.setInterval(() => {
			loadStatus()
		}, 1200)
	}

	const startConnect = async () => {
		setLoading(true)
		setErrorText(null)
		setQr(null)
		setStatus('connecting')

		try {
			const res = await fetch(`${backendUrl}/whatsapp/start`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId }),
			})

			const data = await res.json().catch(() => ({}))
			// неважно что вернул start — дальше мы гарантированно обновим статус
		} catch (e) {
			setErrorText('Не удалось запустить подключение. Проверьте бэкенд.')
			setLoading(false)
			return
		}

		// ключевое: сразу дергаем статус и включаем поллинг
		await loadStatus()
		startPolling()
	}

	// при открытии страницы — подгружаем статус, и если процесс идет — поллим
	useEffect(() => {
		loadStatus().then(() => {
			// если уже идет подключение/qr — продолжаем поллинг
			setTimeout(() => {
				// читаем актуальный DOM-state через повторный запрос
				loadStatus().then(() => startPolling())
			}, 200)
		})

		return () => stopPolling()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [userId])

	// ----- UI -----
	let yellowContent: React.ReactNode = null
			/*<p style={{ marginTop: 8, marginBottom: 0 }}>
					Теперь сервис может отправлять сообщения от вашего имени.
				</p>*/
	if (status === 'connected') {
		yellowContent = (
			<div style={{ textAlign: 'center' }}>
				<strong>WhatsApp успешно подключён</strong>
			</div>
		)
	} else if (status === 'pending_qr' && qr) {
		yellowContent = (
			<div style={{ textAlign: 'center' }}>
				<p style={{ marginBottom: 12 }}>
					Отсканируйте QR-код в WhatsApp:
					<br />
				</p>
				<QRCodeCanvas value={qr} size={220} />
			</div>
		)
	} else if (status === 'connecting') {
		yellowContent = (
			<div style={{ textAlign: 'center' }}>
				<strong>Запускаем подключение к WhatsApp…</strong>
				<p style={{ marginTop: 8, marginBottom: 0 }}>
					Подождите несколько секунд
				</p>
			</div>
		)
	} else if (status === 'error') {
		yellowContent = (
			<div style={{ textAlign: 'center' }}>
				<div>Не удалось подключиться. Попробуйте ещё раз.</div>
				{errorText ? (
					<div>
						{errorText}
					</div>
				) : null}
				<button
					onClick={startConnect}
					disabled={loading}
				>
					{loading ? 'Запуск…' : 'Сканировать QR-код ещё раз'}
				</button>
			</div>
		)
	} else {
		// not_connected
		yellowContent = (
			<div className='yellowContent'>
				<div>Сканируйте QR-код, чтобы подключить аккаунт</div>
				<button
					onClick={startConnect}
					disabled={loading}
					style={{ marginTop: 12, padding: '10px 16px' }}
				>
					{loading ? 'Запуск…' : 'Сканировать QR-код'}
				</button>
			</div>
		)
	}

	return (
		<div className='wa'>
			<h2 className='wa-title'>Подключите WhatsApp</h2>
			<p className='wa-text'>
				Чтобы сервис мог отправлять рассылки от вашего имени, подключите ваш
				WhatsApp-аккаунт через QR-код.
			</p>

			<div className='instruction '>
				<WhatsappLinkingSteps />
			</div>

			<div className='yellowContent-cont'>{yellowContent}</div>
		</div>
	)
}
