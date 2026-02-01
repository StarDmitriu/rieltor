'use client'
//frontend/src/app/dashboard/templates/page.tsx
import { useEffect, useMemo, useState } from 'react'
import Cookies from 'js-cookie'
import { message, Popconfirm, Segmented, Select, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
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

type UiGroupRow = {
	id: string
	title: string | null
	participants_count: number | null
	is_selected: boolean
	send_time?: string | null
	disabled?: boolean
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '/api'

const SEND_INTERVAL_OPTIONS = [
	{ value: '2-5m', label: '2-5 минут' },
	{ value: '5-15m', label: '5-15 минут' },
	{ value: '15-30m', label: '15-30 минут' },
	{ value: '30-60m', label: '30-60 минут' },
	{ value: '1-2h', label: '1-2 часа' },
	{ value: '2-4h', label: '2-4 часа' },
	{ value: '6h', label: 'раз в 6 часов' },
	{ value: '6-12h', label: '6-12 часов' },
	{ value: '12h', label: 'раз в 12 часов' },
	{ value: '24h', label: 'раз в 24 часа' },
]

export default function TemplatesPage() {
	const router = useRouter()
	const [userId, setUserId] = useState('')
	const [loading, setLoading] = useState(false)
	const [rows, setRows] = useState<TemplateRow[]>([])

	const [groupChannel, setGroupChannel] = useState<'wa' | 'tg'>('wa')
	const [waGroups, setWaGroups] = useState<UiGroupRow[]>([])
	const [tgGroups, setTgGroups] = useState<UiGroupRow[]>([])
	const [loadingGroups, setLoadingGroups] = useState(false)
	const [savingMap, setSavingMap] = useState<Record<string, boolean>>({})
	const [savingTimeMap, setSavingTimeMap] = useState<Record<string, boolean>>(
		{}
	)
	const token = Cookies.get('token') || ''

	const fetchMe = async () => {
		if (!token) {
			router.push('/auth/phone')
			return;		}
		try {
			const res = await fetch(`${BACKEND_URL}/auth/me`, {
				headers: { Authorization: `Bearer ${token}` },
				cache: 'no-store',
			})
			const json = await res.json()
			if (!json?.success) {
				Cookies.remove('token')
				router.push('/auth/phone')
				return;			}
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
				message.error(
					`Ошибка загрузки шаблонов: ${json?.message || 'unknown'}`
				)
				return;			}
			setRows(json.templates || [])
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при загрузке шаблонов')
		} finally {
			setLoading(false)
		}
	}

	const fetchGroups = async (uid: string, ch: 'wa' | 'tg') => {
		if (!uid) return
		setLoadingGroups(true)
		try {
			const url =
				ch === 'wa'
					? `${BACKEND_URL}/whatsapp/groups/${uid}`
					: `${BACKEND_URL}/telegram/groups/${uid}`
			const res = await fetch(url, { cache: 'no-store' })
			const data = await res.json()
			if (!data?.success) {
				message.error('Не удалось загрузить группы из БД')
				return;			}

			if (ch === 'wa') {
				const mapped: UiGroupRow[] = (data.groups || []).map((g: any) => ({
					id: String(g.wa_group_id),
					title: g.subject ?? null,
					participants_count: g.participants_count ?? null,
					is_selected: g.is_selected !== false,
					send_time: g.send_time ?? null,
					disabled: !!g.is_announcement,
				}))
				setWaGroups(mapped)
				return mapped.length
			} else {
				const mapped: UiGroupRow[] = (data.groups || []).map((g: any) => ({
					id: String(g.tg_chat_id),
					title: g.title ?? null,
					participants_count: g.participants_count ?? null,
					is_selected: g.is_selected !== false,
					send_time: g.send_time ?? null,
				}))
				setTgGroups(mapped)
				return mapped.length
			}
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при загрузке групп')
		} finally {
			setLoadingGroups(false)
		}
	}

	const syncGroups = async (uid: string, ch: 'wa' | 'tg') => {
		const url =
			ch === 'wa'
				? `${BACKEND_URL}/whatsapp/sync-groups`
				: `${BACKEND_URL}/telegram/sync-groups`
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId: uid }),
			})
			const data = await res.json()
			if (!data?.success) {
				if (data.message === 'whatsapp_not_connected') {
					message.error('WhatsApp не подключён. Подключите WhatsApp по QR.')
					return;				}
				if (data.message === 'telegram_not_connected') {
					message.error('Telegram не подключён. Подключите Telegram.')
					return;				}
				if (data.message === 'telegram_timeout') {
					message.error('Telegram временно не отвечает. Попробуйте позже.')
					return;				}
				message.error(`Ошибка синка групп: ${data.message || 'unknown'}`)
				return;			}
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при синхронизации групп')
		}
	}

	const setSelected = async (
		ch: 'wa' | 'tg',
		groupId: string,
		next: boolean
	) => {
		if (!userId) return

		const key = `${ch}:${groupId}`
		const updateGroup = (rows: UiGroupRow[]) =>
			rows.map(r => (r.id === groupId ? { ...r, is_selected: next } : r))

		if (ch === 'wa') setWaGroups(prev => updateGroup(prev))
		else setTgGroups(prev => updateGroup(prev))

		setSavingMap(prev => ({ ...prev, [key]: true }))

		try {
			const url =
				ch === 'wa'
					? `${BACKEND_URL}/whatsapp/groups/select`
					: `${BACKEND_URL}/telegram/groups/select`
			const body =
				ch === 'wa'
					? { userId, wa_group_id: groupId, is_selected: next }
					: { userId, tg_chat_id: groupId, is_selected: next }

			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			})
			const json = await res.json()
			if (!json?.success) {
				message.error(
					`Не удалось сохранить выбор группы: ${json?.message || 'unknown'}`
				)
				const revert = (rows: UiGroupRow[]) =>
					rows.map(r =>
						r.id === groupId ? { ...r, is_selected: !next } : r
					)
				if (ch === 'wa') setWaGroups(prev => revert(prev))
				else setTgGroups(prev => revert(prev))
			}
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при сохранении выбора группы')
			const revert = (rows: UiGroupRow[]) =>
				rows.map(r =>
					r.id === groupId ? { ...r, is_selected: !next } : r
				)
			if (ch === 'wa') setWaGroups(prev => revert(prev))
			else setTgGroups(prev => revert(prev))
		} finally {
			setSavingMap(prev => ({ ...prev, [key]: false }))
		}
	}

	const setSendTime = async (
		ch: 'wa' | 'tg',
		groupId: string,
		next: string | null
	) => {
		if (!userId) return

		const key = `${ch}:${groupId}`
		const updateGroup = (rows: UiGroupRow[]) =>
			rows.map(r => (r.id === groupId ? { ...r, send_time: next } : r))

		if (ch === 'wa') setWaGroups(prev => updateGroup(prev))
		else setTgGroups(prev => updateGroup(prev))

		setSavingTimeMap(prev => ({ ...prev, [key]: true }))

		try {
			const url =
				ch === 'wa'
					? `${BACKEND_URL}/whatsapp/groups/time`
					: `${BACKEND_URL}/telegram/groups/time`
			const body =
				ch === 'wa'
					? { userId, wa_group_id: groupId, send_time: next }
					: { userId, tg_chat_id: groupId, send_time: next }

			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			})
			const json = await res.json()
			if (!json?.success) {
				message.error(
					`Не удалось сохранить интервал группы: ${json?.message || 'unknown'}`
				)
			}
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при сохранении интервала группы')
		} finally {
			setSavingTimeMap(prev => ({ ...prev, [key]: false }))
		}
	}

	const handleSelectionChange = async (
		ch: 'wa' | 'tg',
		nextKeys: React.Key[]
	) => {
		const currentGroups = ch === 'wa' ? waGroups : tgGroups
		const currentSelected = new Set(
			currentGroups.filter(g => g.is_selected).map(g => g.id)
		)
		const nextSelected = new Set(nextKeys.map(k => String(k)))

		for (const id of currentSelected) {
			if (!nextSelected.has(id)) {
				// eslint-disable-next-line no-await-in-loop
				await setSelected(ch, id, false)
			}
		}

		for (const id of nextSelected) {
			if (!currentSelected.has(id)) {
				// eslint-disable-next-line no-await-in-loop
				await setSelected(ch, id, true)
			}
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

	useEffect(() => {
		if (!userId) return
		void (async () => {
			const waCount = await fetchGroups(userId, 'wa')
			const tgCount = await fetchGroups(userId, 'tg')

			if (!waCount) {
				await syncGroups(userId, 'wa')
				await fetchGroups(userId, 'wa')
			}
			if (!tgCount) {
				await syncGroups(userId, 'tg')
				await fetchGroups(userId, 'tg')
			}
		})()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [userId])

	const sorted = useMemo(() => {
		return [...rows].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
	}, [rows])

	const currentGroups = groupChannel === 'wa' ? waGroups : tgGroups
	const selectedKeys = currentGroups
		.filter(g => g.is_selected)
		.map(g => g.id)

	const groupColumns: ColumnsType<UiGroupRow> = useMemo(() => {
		const cols: ColumnsType<UiGroupRow> = [
			{
				title: 'Название',
				dataIndex: 'title',
				key: 'title',
				render: (v: any) =>
					v || <span style={{ opacity: 0.6 }}>без названия</span>,
			},
		]

		if (groupChannel === 'tg') {
			cols.push({
				title: 'Интервал',
				key: 'send_time',
				width: 200,
				render: (_: any, row: UiGroupRow) => (
					<Select
						allowClear
						placeholder='Интервал'
						size='small'
						style={{ width: 170 }}
						value={row.send_time ?? undefined}
						options={SEND_INTERVAL_OPTIONS}
						disabled={!!savingTimeMap[`${groupChannel}:${row.id}`]}
						onChange={v => setSendTime(groupChannel, row.id, v ?? null)}
					/>
				),
			})
		}

		cols.push({
			title: 'Участники',
			dataIndex: 'participants_count',
			key: 'participants_count',
			width: 120,
			render: (v: any) => (typeof v === 'number' ? v : '-'),
		})

		return cols;
	}, [groupChannel, savingTimeMap])

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

					<button
						className='tpl-btn'
						onClick={() => router.push('/dashboard/campaigns')}
					>
						Перейти в рассылки
					</button>

					<button className='tpl-btn' onClick={() => load()} disabled={loading}>
						{loading ? 'Обновляем...' : 'Обновить'}
					</button>

					<button className='tpl-btn' onClick={() => router.push('/cabinet')}>
						Назад
					</button>
				</div>

				<div className='tpl__content'>
					<div className='tpl__left'>
						{sorted.length === 0 ? (
							<div className='tpl-empty'>
								<div className='tpl-empty__title'>Пока нет шаблонов</div>
								<div className='tpl-empty__text'>
									Нажмите «Создать шаблон», чтобы добавить первый.
								</div>
							</div>
						) : (
							<div className='tpl__list'>
								{sorted.map(row => (
									<div className='tpl-row' key={row.id}>
										<div className='tpl-card'>
											<div className='tpl-card__title'>
												{row.title?.trim()
													? row.title
													: 'Шаблон'}
											</div>

											<div className='tpl-card__textBox'>
												{row.text?.trim() ? row.text : 'Текст шаблона'}
											</div>

											<div className='tpl-card__badges'>
												<span
													className={`tpl-badge ${
														row.enabled ? 'on' : 'off'
													}`}
												>
													{row.enabled ? 'ON' : 'OFF'}
												</span>
												<span className='tpl-badge neutral'>
													Order: {row.order}
												</span>
												<span className='tpl-badge neutral'>
													Обновлён:{' '}
													{row.updated_at
														? new Date(row.updated_at).toLocaleString()
														: '-'}
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
													Редактируйте шаблон и порядок отправки.
												</div>
											</div>

											<div className='tpl-action'>
												<Popconfirm
													title='Удалить шаблон?'
													description='После удаления восстановить нельзя.'
													okText='Удалить'
													cancelText='Отмена'
													onConfirm={async () => {
														if (!userId)
															return message.error('Нет userId')
														const res: any = await apiPost('/templates/delete', {
															userId,
															templateId: row.id,
														})
														if (!res?.success) {
															message.error(
																`Ошибка удаления: ${res?.message || 'unknown'}`
															)
															return;														}
														message.success('Шаблон удален')
														load()
													}}
												>
													<button className='tpl-btn tpl-btn--wide tpl-btn--danger'>
														Удалить
													</button>
												</Popconfirm>

												<div className='tpl-action__hint'>
													Удаляйте, если шаблон больше не нужен.
												</div>
											</div>
										</div>
									</div>
								))}
							</div>
						)}
					</div>

					<div className='tpl__right'>
						<div className='tpl-groups'>
							<div className='tpl-groups__head'>
								<div className='tpl-groups__title'>
									Куда отправлять сообщения
								</div>

								<Segmented
									value={groupChannel}
									onChange={v => setGroupChannel(v as any)}
									options={[
										{ label: 'WhatsApp', value: 'wa' },
										{ label: 'Telegram', value: 'tg' },
									]}
								/>
							</div>

							<div className='tpl-groups__meta'>
								Канал: <b>{groupChannel.toUpperCase()}</b> · Выбрано:{' '}
								<b>{selectedKeys.length}</b> · Доступно:{' '}
								<b>{currentGroups.length}</b>
							</div>

							<div className='tpl-groups__buttons'>
								<button
									type='button'
									className='tpl-pill'
									onClick={async () => {
										const ids = currentGroups
											.filter(g => !g.disabled)
											.map(g => g.id)
										await handleSelectionChange(groupChannel, ids)
									}}
									disabled={!currentGroups.length}
								>
									Выбрать все
								</button>

								<button
									type='button'
									className='tpl-pill'
									onClick={() => handleSelectionChange(groupChannel, [])}
									disabled={!currentGroups.length}
								>
									Снять все
								</button>
							</div>

							<div className='tpl-table'>
								<Table
									rowKey='id'
									columns={groupColumns}
									dataSource={currentGroups}
									loading={loadingGroups}
									pagination={{ pageSize: 8 }}
									rowSelection={{
										selectedRowKeys: selectedKeys,
										onChange: keys =>
											handleSelectionChange(groupChannel, keys),
										getCheckboxProps: (row: UiGroupRow) => ({
											disabled:
												row.disabled ||
												!!savingMap[`${groupChannel}:${row.id}`],
										}),
									}}
								/>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
