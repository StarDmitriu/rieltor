// frontend/src/app/cabinet/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Cookies from 'js-cookie'
import { WhatsappConnectBlock } from '@/components/WhatsappConnectBlock'
import { SheetsBlock } from '@/components/SheetsBlock'
import { TemplatesSyncBlock } from '@/components/TemplatesSyncBlock'
import { CampaignBlock } from '@/components/CampaignBlock'
import { TelegramConnect } from '@/components/TelegramConnect'

interface User {
	id: string
	phone: string
	full_name?: string | null
	gender?: string | null
	telegram?: string | null
	birthday?: string | null

	// ✅ у тебя в БД так называется
	gsheet_url?: string | null
}

export default function CabinetPage() {
	const router = useRouter()
	const [user, setUser] = useState<User | null>(null)
	const [loading, setLoading] = useState(true)

	const backendUrl = 'http://localhost:3000'

	useEffect(() => {
		const token = Cookies.get('token')
		if (!token) {
			router.push('/auth/phone')
			return
		}

		const loadMe = async () => {
			try {
				const res = await fetch(`${backendUrl}/auth/me`, {
					headers: { Authorization: `Bearer ${token}` },
					cache: 'no-store',
				})
				const data = await res.json()
				if (!data.success) {
					Cookies.remove('token')
					router.push('/auth/phone')
					return
				}
				setUser(data.user)
			} catch (e) {
				console.error(e)
			} finally {
				setLoading(false)
			}
		}

		loadMe()
	}, [router])

	const goTemplates = () => router.push('/dashboard/templates')

	const logout = () => {
		Cookies.remove('token')
		router.push('/auth/phone')
	}

	const goSubscription = () => router.push('/cabinet/subscription')

	const dash = () => {
		router.push('/dashboard/groups')
	}

	if (loading) return <div style={{ padding: 24 }}>Загрузка...</div>

	if (!user) {
		return (
			<div style={{ padding: 24 }}>
				Пользователь не найден.{' '}
				<button onClick={() => router.push('/auth/phone')}>Войти</button>
			</div>
		)
	}

	return (
		<div style={{ padding: 24 }}>
			<h1>Личный кабинет</h1>

			<button
				onClick={logout}
				style={{
					position: 'absolute',
					top: 16,
					right: 16,
					padding: '6px 12px',
					borderRadius: 8,
					border: '1px solid #ccc',
					background: '#f5f5f5',
					cursor: 'pointer',
				}}
			>
				Выйти
			</button>

			<div
				style={{
					marginTop: 16,
					padding: 16,
					borderRadius: 12,
					border: '1px solid #e0e0e0',
					maxWidth: 560,
				}}
			>
				<h2>Профиль</h2>
				<p>
					<strong>Имя:</strong> {user.full_name || 'Не указано'}
				</p>
				<p>
					<strong>Телефон:</strong> {user.phone}
				</p>
				<p>
					<strong>Пол:</strong>{' '}
					{user.gender === 'm'
						? 'Мужской'
						: user.gender === 'f'
						? 'Женский'
						: 'Не указан'}
				</p>
				<p>
					<strong>Telegram:</strong> {user.telegram || 'Не указан'}
				</p>
				<p>
					<strong>Дата рождения:</strong>{' '}
					{user.birthday ? user.birthday : 'Не указана'}
				</p>

				<button
					onClick={dash}
					style={{
						padding: '6px 12px',
						borderRadius: 8,
						border: '1px solid #ccc',
						background: '#f5f5f5',
						cursor: 'pointer',
					}}
				>
					Группы
				</button>

				<button
					onClick={goTemplates}
					style={{
						marginLeft: 8,
						padding: '6px 12px',
						borderRadius: 8,
						border: '1px solid #ccc',
						background: '#f5f5f5',
						cursor: 'pointer',
					}}
				>
					Шаблоны
				</button>

				<button
					onClick={goSubscription}
					style={{
						marginLeft: 8,
						padding: '6px 12px',
						borderRadius: 8,
						border: '1px solid #ccc',
						background: '#f5f5f5',
						cursor: 'pointer',
					}}
				>
					Подписка
				</button>
			</div>

			{/* ✅ таблица */}
			<SheetsBlock
				userId={user.id}
				gsheetUrl={user.gsheet_url}
				onCreated={url => setUser(u => (u ? { ...u, gsheet_url: url } : u))}
			/>

			<TelegramConnect userId={user.id} />

			{/* ✅ синк шаблонов */}
			<TemplatesSyncBlock userId={user.id} />

			{/* ✅ рассылка + переход на прогресс */}
			<CampaignBlock />

			{/* ✅ WhatsApp */}
			<div style={{ marginTop: 16 }}>
				<WhatsappConnectBlock userId={user.id} />
			</div>
		</div>
	)
}
