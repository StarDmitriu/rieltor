'use client'

import { useEffect, useState } from 'react'
import Cookies from 'js-cookie'
import { useRouter } from 'next/navigation'
import './page.css'

const backendUrl =
	process.env.NEXT_PUBLIC_BACKEND_URL || '/api'

export default function SubscriptionPage() {
	const router = useRouter()
	const [loading, setLoading] = useState(true)
	const [data, setData] = useState<any>(null)
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		const token = Cookies.get('token')
		if (!token) {
			router.push('/auth/phone')
			return
		}

		const load = async () => {
			setLoading(true)
			try {
				const res = await fetch(`${backendUrl}/subscriptions/me`, {
					headers: { Authorization: `Bearer ${token}` },
					cache: 'no-store',
				})
				const json = await res.json()
				console.log('subscriptions/me response:', json)
				console.log('backendUrl:', backendUrl)
				setData(json)
			} catch (e) {
				console.error(e)
			} finally {
				setLoading(false)
			}
		}

		load()
	}, [router])

	const startTrial = async () => {
		const token = Cookies.get('token')
		if (!token) return
		setBusy(true)
		try {
			const res = await fetch(`${backendUrl}/subscriptions/start-trial`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${token}` },
			})
			const json = await res.json()
			if (!json.success) {
				alert(json.message || 'Не удалось запустить тест')
				return
			}

			alert('Пробный период активирован!')

			const me = await fetch(`${backendUrl}/subscriptions/me`, {
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
				},
				cache: 'no-store',
			})
			setData(await me.json())
		} catch (e) {
			console.error(e)
			alert('Ошибка сети')
		} finally {
			setBusy(false)
		}
	}

	if (loading) return <div style={{ padding: 24 }}>Загрузка...</div>

	// ❗ если success=false — показываем ошибку
	if (!data?.success) {
		return (
			<div style={{ padding: 24 }}>
				<h2>Подписка</h2>
				<p>Не удалось загрузить данные: {data?.message || 'ошибка'}</p>
				<button onClick={() => router.push('/cabinet')}>Назад</button>
			</div>
		)
	}

	// ✅ success=true — используем РЕАЛЬНЫЕ поля ответа
	const sub = data.subscription || {}
	const status = data.status || sub.status || 'none'
	const daysLeft = data.accessDaysLeft ?? 0
	const endsAt = data.accessEndsAt ?? null
	let rusStatus = ''

	const canStartTrial =
		!data.isBlocked &&
		status !== 'active' &&
		status !== 'trial' &&
		daysLeft === 0

	if (status === 'active'){
		rusStatus = 'Активна'
	} else if (status === 'trial') {
		rusStatus = 'Пробный период'
	}
		return (
			<div className='subscription'>
				<h1 className='subscription-title'>Моя подписка</h1>
				<p className='subscription-text'>
					Здесь вы можете продлить доступ, сменить тариф или отключить
					автосписание
				</p>
				<div className='subscription-cont'>
					<div className='subscription-data'>
						<strong>Текущий тариф</strong>
						<p className='subscription-data-text'>{rusStatus}</p>
					</div>
					<div className='subscription-data'>
						<strong>Осталось дней</strong>
						<p className='subscription-data-text'>{daysLeft}</p>
					</div>
					<div className='subscription-data'>
						<strong>Действует до:</strong>{' '}
						<p className='subscription-data-text'>
							{endsAt ? new Date(endsAt).toLocaleString() : '—'}
						</p>
					</div>

					{data.isBlocked ? (
						<p style={{ color: 'red' }}>
							<strong>Аккаунт заблокирован администратором</strong>
						</p>
					) : null}

					<div style={{ marginTop: 12 }}>
						{canStartTrial ? (
							<button
								onClick={startTrial}
								disabled={busy}
								style={{ padding: 10 }}
							>
								{busy ? 'Запускаем...' : 'Начать пробный период (3 дня)'}
							</button>
						) : null}

						{!data.isBlocked ? (
							<button
								onClick={() => alert('Оплата будет подключена через Продамус')}
								style={{ padding: 10, marginLeft: 8 }}
							>
								Оплатить 2000₽ / месяц
							</button>
						) : null}

						<button
							onClick={() => router.push('/cabinet')}
							style={{ padding: 10, marginLeft: 8 }}
						>
							Назад в кабинет
						</button>
					</div>
				</div>
				<p className='subscription-footer'>
					После окончания подписки доступ к сервису будет приостановлен
				</p>
			</div>
		)
}
