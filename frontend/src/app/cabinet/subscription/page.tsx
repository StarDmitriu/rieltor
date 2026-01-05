'use client'

import { useEffect, useState } from 'react'
import Cookies from 'js-cookie'
import { useRouter } from 'next/navigation'

const backendUrl = 'http://localhost:3000'

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
			// обновим
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

	if (!data?.success) {
		return (
			<div style={{ padding: 24 }}>
				<h2>Подписка</h2>
				<p>Не удалось загрузить данные: {data?.message || 'ошибка'}</p>
				<button onClick={() => router.push('/cabinet')}>Назад</button>
			</div>
		)
	}

	const sub = data.subscription || {}
	const status = sub.status || 'none'

	return (
		<div style={{ padding: 24, maxWidth: 720 }}>
			<h1>Подписка</h1>

			<div
				style={{
					marginTop: 16,
					padding: 16,
					border: '1px solid #e0e0e0',
					borderRadius: 12,
				}}
			>
				<p>
					<strong>Статус:</strong> {status}
				</p>
				<p>
					<strong>Дней осталось:</strong> {data.daysLeft ?? 0}
				</p>
				<p>
					<strong>Действует до:</strong>{' '}
					{data.endsAt ? new Date(data.endsAt).toLocaleString() : '—'}
				</p>

				{data.isBlocked ? (
					<p style={{ color: 'red' }}>
						<strong>Аккаунт заблокирован администратором</strong>
					</p>
				) : null}

				<div style={{ marginTop: 12 }}>
					{status !== 'active' &&
					(status !== 'trial' || (data.daysLeft ?? 0) === 0) ? (
						<button
							onClick={startTrial}
							disabled={busy}
							style={{ padding: 10 }}
						>
							{busy ? 'Запускаем...' : 'Начать пробный период (3 дня)'}
						</button>
					) : null}

					{/* Оплату подключим позже — пока кнопка-заглушка */}
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
		</div>
	)
}
