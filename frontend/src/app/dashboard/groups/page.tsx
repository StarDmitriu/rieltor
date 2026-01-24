'use client'

import { useEffect, useMemo, useState } from 'react'
import Cookies from 'js-cookie'
import { Button, Table, message, Space, Tag, Checkbox, Input, Select } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRouter } from 'next/navigation'
import styles from '../telegram-groups/telegram-groups.module.css' // <-- берем те же стили

const BACKEND_URL =
	process.env.NEXT_PUBLIC_BACKEND_URL || '/api'

type MeResponse =
	| {
			success: true
			user: { id: string; phone: string; full_name?: string | null }
	  }
	| { success: false; message: string }

type GroupRow = {
	wa_group_id: string
	subject: string | null
	participants_count: number | null
	is_announcement: boolean | null
	is_restricted: boolean | null
	updated_at: string
	is_selected?: boolean | null
	send_time?: string | null
}

type GroupsResponse =
	| { success: true; groups: GroupRow[] }
	| { success: false; message: string }

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

export default function GroupsPage() {
	const router = useRouter()

	const [userId, setUserId] = useState<string>('')
	const [loadingMe, setLoadingMe] = useState(false)
	const [loadingGroups, setLoadingGroups] = useState(false)
	const [syncing, setSyncing] = useState(false)
	const [savingMap, setSavingMap] = useState<Record<string, boolean>>({})
	const [savingTimeMap, setSavingTimeMap] = useState<Record<string, boolean>>(
		{}
	)
	const [groups, setGroups] = useState<GroupRow[]>([])
	const [q, setQ] = useState('')

	const token = Cookies.get('token') || ''

	const fetchMe = async () => {
		setLoadingMe(true)
		try {
			const res = await fetch(`${BACKEND_URL}/auth/me`, {
				headers: { Authorization: `Bearer ${token}` },
				cache: 'no-store',
			})
			const data: MeResponse = await res.json()
			if (!data.success) {
				message.error(data.message || 'Не удалось получить /auth/me')
				return
			}
			setUserId(data.user.id)
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при получении /auth/me')
		} finally {
			setLoadingMe(false)
		}
	}

	const fetchGroups = async (uid: string) => {
		if (!uid) return
		setLoadingGroups(true)
		try {
			const res = await fetch(`${BACKEND_URL}/whatsapp/groups/${uid}`, {
				cache: 'no-store',
			})
			const data: GroupsResponse = await res.json()
			if ((data as any).success) setGroups((data as any).groups || [])
			else message.error('Не удалось загрузить группы из БД')
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при загрузке групп')
		} finally {
			setLoadingGroups(false)
		}
	}

	const syncGroups = async () => {
		if (!userId) return message.warning('Нет userId — перелогиньтесь')
		setSyncing(true)
		try {
			const res = await fetch(`${BACKEND_URL}/whatsapp/sync-groups`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId }),
			})
			const data = await res.json()
			if (!data.success) {
				if (data.message === 'whatsapp_not_connected') {
					message.error(
						'WhatsApp не подключён. Сначала подключите WhatsApp по QR.'
					)
				} else {
					message.error(`Ошибка синка групп: ${data.message || 'unknown'}`)
				}
				return
			}
			message.success(`Группы обновлены: ${data.count}`)
			await fetchGroups(userId)
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при /whatsapp/sync-groups')
		} finally {
			setSyncing(false)
		}
	}

	const setSelected = async (waGroupId: string, next: boolean) => {
		if (!userId) return

		setGroups(prev =>
			prev.map(g =>
				g.wa_group_id === waGroupId ? { ...g, is_selected: next } : g
			)
		)
		setSavingMap(prev => ({ ...prev, [waGroupId]: true }))

		try {
			const res = await fetch(`${BACKEND_URL}/whatsapp/groups/select`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userId,
					wa_group_id: waGroupId,
					is_selected: next,
				}),
			})
			const json = await res.json()
			if (!json?.success) {
				message.error(
					`Не удалось сохранить выбор группы: ${json?.message || 'unknown'}`
				)
				setGroups(prev =>
					prev.map(g =>
						g.wa_group_id === waGroupId ? { ...g, is_selected: !next } : g
					)
				)
			}
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при сохранении выбора группы')
			setGroups(prev =>
				prev.map(g =>
					g.wa_group_id === waGroupId ? { ...g, is_selected: !next } : g
				)
			)
		} finally {
			setSavingMap(prev => ({ ...prev, [waGroupId]: false }))
		}
	}

	const setSendTime = async (waGroupId: string, next: string | null) => {
		if (!userId) return

		setGroups(prev =>
			prev.map(g =>
				g.wa_group_id === waGroupId ? { ...g, send_time: next } : g
			)
		)
		setSavingTimeMap(prev => ({ ...prev, [waGroupId]: true }))

		try {
			const res = await fetch(`${BACKEND_URL}/whatsapp/groups/time`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userId,
					wa_group_id: waGroupId,
					send_time: next,
				}),
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
			setSavingTimeMap(prev => ({ ...prev, [waGroupId]: false }))
		}
	}

	const selectAll = async (val: boolean) => {
		const ids = groups.map(g => g.wa_group_id)
		setGroups(prev => prev.map(g => ({ ...g, is_selected: val })))
		for (const id of ids) {
			// eslint-disable-next-line no-await-in-loop
			await setSelected(id, val)
		}
	}

	useEffect(() => {
		if (!token) return message.warning('Нет токена. Войдите в аккаунт.')
		fetchMe()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [token])

	useEffect(() => {
		if (userId) fetchGroups(userId)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [userId])

	const filtered = useMemo(() => {
		const s = q.trim().toLowerCase()
		if (!s) return groups
		return groups.filter(g => (g.subject || '').toLowerCase().includes(s))
	}, [groups, q])

	const total = groups.length
	const selectedCount = groups.filter(g => g.is_selected !== false).length

	const columns: ColumnsType<GroupRow> = [
		{
			title: 'Название группы',
			dataIndex: 'subject',
			key: 'subject',
			render: (v: string | null) =>
				v || <span style={{ opacity: 0.6 }}>без названия</span>,
		},
		{
			title: '',
			key: 'pick',
			width: 90,
			align: 'center',
			render: (_: any, row: GroupRow) => {
				const checked = row.is_selected !== false
				const busy = !!savingMap[row.wa_group_id]
				return (
					<Checkbox
						checked={checked}
						disabled={busy || !!row.is_announcement}
						onChange={e => setSelected(row.wa_group_id, e.target.checked)}
					/>
				)
			},
		},
		{
			title: 'Тип',
			key: 'flags',
			width: 220,
			render: (_: any, row: GroupRow) => (
				<Space size={6}>
					{row.is_announcement ? <Tag color='gold'>announce</Tag> : null}
					{row.is_restricted ? <Tag color='red'>restricted</Tag> : null}
				</Space>
			),
		},
		{
			title: 'Интервал',
			key: 'send_time',
			width: 200,
			render: (_: any, row: GroupRow) => (
				<Select
					allowClear
					placeholder='Интервал'
					size='small'
					style={{ width: 170 }}
					value={row.send_time ?? undefined}
					options={SEND_INTERVAL_OPTIONS}
					disabled={!!savingTimeMap[row.wa_group_id]}
					onChange={v => setSendTime(row.wa_group_id, v ?? null)}
				/>
			),
		},
		{
			title: 'Участники',
			dataIndex: 'participants_count',
			key: 'participants_count',
			width: 120,
			render: (v: number | null) => (typeof v === 'number' ? v : '-'),
		},
	]

	return (
		<div className={styles.page}>
			<div className={styles.container}>
				<h1 className={styles.title}>Ваши группы</h1>

				<div className={styles.searchLabel}>Найти группу</div>

				<div className={styles.searchWrap}>
					<Input
						className={styles.searchInput}
						value={q}
						onChange={e => setQ(e.target.value)}
						placeholder=''
						allowClear
					/>
					<svg className={styles.searchIcon} viewBox='0 0 24 24' fill='none'>
						<path
							d='M10.5 18.5a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z'
							stroke='currentColor'
							strokeWidth='2'
						/>
						<path
							d='M16.5 16.5 21 21'
							stroke='currentColor'
							strokeWidth='2'
							strokeLinecap='round'
						/>
					</svg>
				</div>

				{/* Панель действий (как в TG) */}
				<div style={{ marginBottom: 20 }}>
					<Space wrap>
						<Button
							type='primary'
							onClick={syncGroups}
							loading={syncing}
							disabled={!userId}
						>
							Получить группы
						</Button>

						<Button onClick={() => selectAll(true)} disabled={!groups.length}>
							Выбрать все
						</Button>

						<Button onClick={() => selectAll(false)} disabled={!groups.length}>
							Снять все
						</Button>

						<Button
							onClick={() => userId && fetchGroups(userId)}
							loading={loadingGroups}
						>
							Обновить таблицу
						</Button>

						<Button onClick={() => router.push('/dashboard/telegram-groups')}>
							Telegram группы
						</Button>
					</Space>
				</div>

				{/* Счётчики */}
				<div className={styles.counters}>
					<div className={styles.counterRow}>
						<b>Всего групп:</b> {total}
					</div>
					<div className={styles.counterRow}>
						<b>Выбрано групп:</b> {selectedCount}
					</div>
				</div>

				{/* Таблица в "бежевом" контейнере */}
				<div className={styles.panel}>
					<div className={styles.table}>
						<Table
							rowKey='wa_group_id'
							columns={columns}
							dataSource={filtered}
							loading={loadingMe || loadingGroups}
							pagination={false}
							locale={{ emptyText: 'Нет групп' }}
						/>
					</div>
				</div>

				<div className={styles.footer}>
					<div className={styles.doneBtn}>
						<Button onClick={() => window.history.back()}>Готово</Button>
					</div>
				</div>
			</div>
		</div>
	)
}
