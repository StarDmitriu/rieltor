'use client'
//frontend/src/app/dashboard/templates/page.tsx
import { useEffect, useMemo, useState } from 'react'
import Cookies from 'js-cookie'
import { message, Popconfirm } from 'antd'
import { useRouter } from 'next/navigation'
import { apiGet, apiPost } from '@/lib/api'
import './page.css'

type TemplateRow = {
	id: string
	sheet_row: number
	enabled: boolean
	order: number
	title: string | null
	text: string | null
	media_url: string | null
	updated_at: string
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '/api'

export default function TemplatesPage() {
	const router = useRouter()
	const [userId, setUserId] = useState('')
	const [loading, setLoading] = useState(false)
	const [rows, setRows] = useState<TemplateRow[]>([])

	const token = Cookies.get('token') || ''

	const fetchMe = async () => {
		if (!token) {
			router.push('/auth/phone')
			return
		}
		try {
			const res = await fetch(`${BACKEND_URL}/auth/me`, {
				headers: { Authorization: `Bearer ${token}` },
				cache: 'no-store',
			})
			const json = await res.json()
			if (!json?.success) {
				Cookies.remove('token')
				router.push('/auth/phone')
				return
			}
			setUserId(String(json.user.id))
		} catch (e) {
			console.error(e)
			message.error('Не удалось получить пользователя')
		}
	}

	const load = async (uid?: string) => {
		const id = uid ?? userId
		if (!id) return
		setLoading(true)
		try {
			const json: any = await apiGet(`/templates/list/${id}`)
			if (!json?.success) {
				message.error(`Ошибка загрузки шаблонов: ${json?.message || 'unknown'}`)
				return
			}
			setRows(json.templates || [])
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при загрузке шаблонов')
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		fetchMe()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	useEffect(() => {
		if (userId) load(userId)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [userId])

	const sorted = useMemo(() => {
		return [...rows].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
	}, [rows])

	return (
		<div className='tpl'>
			<div className='tpl__wrap'>
				<h1 className='tpl__title'>Ваши шаблоны</h1>

				<div className='tpl__topbar'>
					<button
						className='tpl-btn tpl-btn--primary'
						onClick={() => router.push('/dashboard/templates/new')}
					>
						Создать шаблон
					</button>

					<button className='tpl-btn' onClick={() => load()} disabled={loading}>
						{loading ? 'Обновляем…' : 'Обновить'}
					</button>

					<button className='tpl-btn' onClick={() => router.push('/cabinet')}>
						Назад
					</button>

				</div>

				{sorted.length === 0 ? (
					<div className='tpl-empty'>
						<div className='tpl-empty__title'>Шаблонов пока нет</div>
						<div className='tpl-empty__text'>
							Нажми «Создать шаблон», чтобы добавить первый.
						</div>
					</div>
				) : (
					<div className='tpl__list'>
						{sorted.map(row => (
							<div className='tpl-row' key={row.id}>
								<div className='tpl-card'>
									<div className='tpl-card__title'>
										{row.title?.trim() ? row.title : 'Название шаблона'}
									</div>

									<div className='tpl-card__textBox'>
										{row.text?.trim() ? row.text : 'Текст шаблона'}
									</div>

									<div className='tpl-card__badges'>
										<span className={`tpl-badge ${row.enabled ? 'on' : 'off'}`}>
											{row.enabled ? 'ON' : 'OFF'}
										</span>
										<span className='tpl-badge neutral'>
											Order: {row.order}
										</span>
										<span className='tpl-badge neutral'>
											Обновлён:{' '}
											{row.updated_at
												? new Date(row.updated_at).toLocaleString()
												: '—'}
										</span>
										{row.media_url ? (
											<a
												className='tpl-link'
												href={row.media_url}
												target='_blank'
												rel='noreferrer'
											>
												Медиа: открыть
											</a>
										) : null}
									</div>
								</div>

								<div className='tpl-actions'>
									<div className='tpl-action'>
										<button
											className='tpl-btn tpl-btn--wide'
											onClick={() =>
												router.push(`/dashboard/templates/${row.id}`)
											}
										>
											Редактировать
										</button>
										<div className='tpl-action__hint'>
											Вы можете отредактировать Ваш шаблон
										</div>
									</div>


									{/* архива нет — вместо него сделаем "Удалить" */}
									<div className='tpl-action'>
										<Popconfirm
											title='Удалить шаблон?'
											description='Это действие нельзя отменить.'
											okText='Удалить'
											cancelText='Отмена'
											onConfirm={async () => {
												if (!userId) return message.error('Нет userId')
												const res: any = await apiPost('/templates/delete', {
													userId,
													templateId: row.id,
												})
												if (!res?.success) {
													message.error(
														`Ошибка удаления: ${res?.message || 'unknown'}`
													)
													return
												}
												message.success('Шаблон удалён')
												load()
											}}
										>
											<button className='tpl-btn tpl-btn--wide tpl-btn--danger'>
												Удалить
											</button>
										</Popconfirm>

										<div className='tpl-action__hint'>
											Удалите шаблон, если он больше не актуален
										</div>
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	)
}
