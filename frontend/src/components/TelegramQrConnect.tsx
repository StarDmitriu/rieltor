'use client'
import './TelegramConnectBlock.css'
import { useEffect, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'

type TgQrStatus =
	| 'not_connected'
	| 'pending_qr'
	| 'awaiting_password'
	| 'connected'
	| 'error'

type QrStatusResp = {
	success: boolean
	status: TgQrStatus
	qr?: string | null
	expiresAt?: number | null
	lastError?: string | null
}

export function TelegramQrConnect({ userId }: { userId: string }) {
	const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || '/api'

	const [status, setStatus] = useState<TgQrStatus>('not_connected')
	const [qr, setQr] = useState<string | null>(null)
	const [expiresAt, setExpiresAt] = useState<number | null>(null)
	const [errorText, setErrorText] = useState<string | null>(null)

	const [password, setPassword] = useState('')
	const [loading, setLoading] = useState(false)

	const pollRef = useRef<number | null>(null)

	const stopPolling = () => {
		if (pollRef.current) {
			window.clearInterval(pollRef.current)
			pollRef.current = null
		}
	}

	const startPolling = () => {
		if (pollRef.current) return
		pollRef.current = window.setInterval(() => {
			loadStatus().catch(() => {})
		}, 1000) // чуть чаще, чтобы успевать ловить успех после скана
	}

	const loadStatus = async () => {
		const res = await fetch(`${backendUrl}/telegram/qr/status/${userId}`, {
			cache: 'no-store',
		})
		const data: QrStatusResp = await res.json()

		if (!data?.success) return

		setStatus(data.status)
		setQr(data.qr ?? null)
		setExpiresAt(data.expiresAt ?? null)

		// lastError может быть "qr_expired_refreshing" или "2fa_required" и т.п.
		const le = data.lastError ?? null
		if (le === 'qr_expired_refreshing') {
			setErrorText('QR-код истёк — обновляем…')
		} else if (le === '2fa_required') {
			setErrorText(null) // это не ошибка, это шаг
		} else if (le === 'invalid_2fa_password') {
			setErrorText('Неверный пароль 2FA')
		} else {
			setErrorText(le)
		}

		// стопаем поллинг только на connected/error
		if (data.status === 'connected' || data.status === 'error') {
			stopPolling()
			setLoading(false)
		}

		// если мы показываем QR — тоже снимаем loading
		if (data.status === 'pending_qr' && data.qr) {
			setLoading(false)
		}

		// если ждём пароль — снимаем loading, пусть вводят
		if (data.status === 'awaiting_password') {
			setLoading(false)
		}
	}

	const start = async () => {
		setLoading(true)
		setErrorText(null)
		setQr(null)
		setPassword('')

		try {
			await fetch(`${backendUrl}/telegram/qr/start`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId }),
			})
		} catch {
			setErrorText('Не удалось запустить QR-подключение Telegram')
			setLoading(false)
			return
		}

		await loadStatus().catch(() => {})
		startPolling()
	}

	const confirmPassword = async () => {
		const pass = password.trim()
		if (!pass) return

		setLoading(true)
		setErrorText(null)

		try {
			const res = await fetch(`${backendUrl}/telegram/qr/confirm-password`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId, password: pass }),
			})
			const data = await res.json().catch(() => ({}))

			if (!data?.success) {
				// бэк может вернуть message=invalid_2fa_password или текст ошибки
				if (data?.message === 'invalid_2fa_password') {
					setErrorText('Неверный пароль 2FA')
				} else {
					setErrorText(data?.message || 'Не удалось подтвердить 2FA пароль')
				}
				setLoading(false)
				return
			}

			setPassword('')
			await loadStatus().catch(() => {})
			startPolling()
		} catch {
			setErrorText('Ошибка сети при вводе 2FA пароля')
		} finally {
			setLoading(false)
		}
	}

	const disconnect = async () => {
		setLoading(true)
		try {
			await fetch(`${backendUrl}/telegram/qr/disconnect`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId }),
			})
		} catch {}
		await loadStatus().catch(() => {})
		setLoading(false)
	}

	useEffect(() => {
		loadStatus()
			.then(() => startPolling())
			.catch(() => {})
		return () => stopPolling()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [userId])

	const hintExpires =
		expiresAt && status === 'pending_qr'
			? `QR истечёт через ${Math.max(
					1,
					Math.ceil((expiresAt - Date.now()) / 1000),
				)} сек.`
			: null

  let rusStatus = ''
  if (status === 'pending_qr') {
		rusStatus = 'Ожидание QR-кода'
	} else if (status === 'connected') {
		rusStatus = 'Подключено'
	} else if (status === 'not_connected') {
		rusStatus = 'Не подключен'
	} else if (status === 'awaiting_password') {
		rusStatus = 'Введите пароль'
	}


		return (
			<div className='tg'>
				<h2 className='tg-title'>Telegram</h2>
				<p className='tg-text'>Подкючение Telegram через QR-код</p>

				<div className='yellowContent-cont'>
					<div className='yellowContent'>
						<div style={{ marginBottom: 8 }}>
							<strong>Статус:</strong> {rusStatus}
						</div>

						{errorText ? (
							<div style={{ color: 'red', marginBottom: 10 }}>{errorText}</div>
						) : null}

						{status === 'connected' ? (
							<div
								style={{
									display: 'flex',
									gap: 12,
									justifyContent: 'space-between',
									alignItems: 'center',
								}}
							>
								<strong>Telegram подключён ✅</strong>
								<button onClick={disconnect} disabled={loading}>
									Отключить
								</button>
							</div>
						) : status === 'awaiting_password' ? (
							<div style={{ textAlign: 'center' }}>
								<p style={{ marginBottom: 8 }}>
									У аккаунта включён пароль 2FA. Введите пароль:
								</p>
								<input
									type='password'
									value={password}
									onChange={e => setPassword(e.target.value)}
									placeholder='Пароль 2FA'
									style={{ padding: '10px 12px', width: 260, maxWidth: '90%' }}
								/>
								<div
									style={{
										marginTop: 10,
										display: 'flex',
										gap: 10,
										justifyContent: 'center',
									}}
								>
									<button
										onClick={confirmPassword}
										disabled={loading || password.trim().length < 2}
										style={{ padding: '10px 14px' }}
									>
										{loading ? 'Проверяем…' : 'Подтвердить'}
									</button>
									<button
										onClick={start}
										disabled={loading}
										style={{ padding: '10px 14px' }}
										title='Сгенерировать новый QR и попробовать заново'
									>
										Начать заново
									</button>
								</div>
							</div>
						) : status === 'pending_qr' && qr ? (
							<div style={{ textAlign: 'center' }}>
								<p>
									Отсканируйте QR-код в Telegram:
									<br />
									Настройки → Устройства → Подключить устройство
								</p>

								<QRCodeCanvas value={qr} size={220} />

								<div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
									{hintExpires ??
										'Если QR обновится — он обновится автоматически.'}
								</div>

								<button
									onClick={start}
									disabled={loading}
									style={{ marginTop: 12 }}
								>
									{loading ? 'Обновляем…' : 'Обновить QR вручную'}
								</button>
							</div>
						) : (
							<div style={{ textAlign: 'center' }}>
								<button
									onClick={start}
									disabled={loading}
									style={{ padding: '10px 16px' }}
								>
									{loading ? 'Запуск…' : 'Подключить Telegram по QR'}
								</button>
								<div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
									Откройте Telegram на телефоне → Настройки → Устройства →
									Подключить устройство
								</div>
							</div>
						)}
					</div>
				</div>
			</div>
		)
}
