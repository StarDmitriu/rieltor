// frontend/src/app/cabinet/page.tsx
'use client'
import './page.css'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Cookies from 'js-cookie'
import { WhatsappConnectBlock } from '@/components/WhatsappConnectBlock'
import { SheetsBlock } from '@/components/SheetsBlock'
import { TemplatesSyncBlock } from '@/components/TemplatesSyncBlock'
import { CampaignBlock } from '@/components/CampaignBlock'
import { TelegramQrConnect } from '@/components/TelegramQrConnect'
import { apiGet } from '@/lib/api'
import { useNotify } from '@/ui/notify/notify'


interface User {
	id: string
	phone: string
	full_name?: string | null
	gender?: string | null
	telegram?: string | null
	birthday?: string | null
	city?: string | null
	gsheet_url?: string | null
	referral_code?: string | null
}

export default function CabinetPage() {
	const router = useRouter()
	const [user, setUser] = useState<User | null>(null)
	const [loading, setLoading] = useState(true)
	const notify = useNotify()

	const backendUrl =
		process.env.NEXT_PUBLIC_BACKEND_URL || '/api'

	useEffect(() => {
		const token = Cookies.get('token')
		if (!token) {
			router.push('/auth/phone')
			return;		}

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
					return;				}
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
	const goSupport = () => router.push('/cabinet/support')

	const dash = () => {
		router.push('/dashboard/groups')
	}

	if (loading) return <div style={{ padding: 24 }}>Загрузка...</div>

	if (!user) {
		router.push('/auth/phone')
		return (
			<div style={{ padding: 24 }}>
				Пользователь не найден.{' '}
			</div>
		)
	}

	return (
		<div>
			<h1 className='title'>Личный кабинет</h1>

			<button
				onClick={logout}
				style={{
					position: 'absolute',
					top: 16,
					right: 16,
				}}
			>
				Выйти
			</button>

			<div className='profile'>
				<div className='profile-text'>
					<strong>Ваше имя и фамилия</strong>
					<p>{user.full_name || 'Не указано'}</p>
				</div>
				<div className='profile-text'>
					<strong>Ваш номер</strong>
					<p>{user.phone}</p>
				</div>
				<div className='profile-text'>
					<strong>Пол</strong>{' '}
					<p>
						{user.gender === 'm'
							? 'Мужской'
							: user.gender === 'f'
								? 'Женский'
								: 'Не указан'}
					</p>
				</div>
				<div className='profile-text'>
					<strong>Ваш ник в телеграм</strong>
					<p>{user.telegram || 'Не указан'}</p>
				</div>
				<div className='profile-text'>
					<strong>Ваша дата рождения</strong>{' '}
					<p>{user.birthday ? user.birthday : 'Не указана'}</p>
				</div>
				<div className='profile-text'>
					<strong>Город</strong> <p>{user.city || 'Не указан'}</p>
				</div>
				<div className='profile-btns'>
					<button onClick={goSubscription}>Ваша подписка</button>
					<button onClick={goSupport}>Связаться с поддержкой</button>
				</div>
			</div>

			<TelegramQrConnect userId={user.id} />

			{/* ✅ WhatsApp */}
			<div style={{ marginTop: 16 }}>
				<WhatsappConnectBlock userId={user.id} />
			</div>

			{/*
				<div className='groups'>
				<h2 className='groups-title'>
					Выберите группы, в которые отправится сообщение
				</h2>
				<div className='groups-button'>
					<button onClick={dash}>Выбрать группы для отправки</button>
				</div>
			</div>
				*/}

			<div className='pattern'>
				<h2 className='pattern-title'>Создание рассылки</h2>
				<p className='pattern-text'>
					Выберите готовый шаблон сообщения или создайте новый
				</p>
				<div className='pattern-button'>
					<button onClick={goTemplates}>Шаблоны</button>
				</div>
			</div>

			{/* ✅ Реферальная ссылка */}
			<div className='link'>
				<h2 className='link-title'>Реферальная ссылка</h2>

				{!user.referral_code ? (
					<p className='link-text'>Реферальный код ещё не создан.</p>
				) : (
					(() => {
						const link =
							typeof window !== 'undefined'
								? `${
										window.location.origin
									}/auth/register?ref=${encodeURIComponent(
										user.referral_code as string,
									)}`
								: ''

						return (
							<>
								<p className='link-text'>
									Отправь другу эту ссылку. Если он оплатит тариф — тебе
									начислим +7 дней.
								</p>

								<input
									onClick={async () => {
										try {
											await navigator.clipboard.writeText(link)
											notify('Ссылка скопирована', { type: 'success' })
										} catch {
											notify('Не удалось скопировать', { type: 'error' })
										}
									}}
									className='link-input'
									value={link}
									readOnly
								/>
							</>
						)
					})()
				)}
			</div>

			{/* ✅ таблица */}
			{/*<SheetsBlock
				userId={user.id}
				gsheetUrl={user.gsheet_url}
				onCreated={url => setUser(u => (u ? { ...u, gsheet_url: url } : u))}
			/>*/}

			{/* ✅ синк шаблонов */}
			{/*<TemplatesSyncBlock userId={user.id} />*/}

			{/* ✅ рассылка + переход на прогресс */}
			<CampaignBlock />
		</div>
	)
}
