//frontend/src/app/dashboard/telegram-groups/page.tsx
'use client'
import { useEffect, useState } from 'react'
import Cookies from 'js-cookie'
import { Button, Table, message, Space, Checkbox, Select } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import styles from './telegram-groups.module.css'
import { Input } from 'antd' 
import { useRouter } from 'next/navigation'


const BACKEND_URL =
	process.env.NEXT_PUBLIC_BACKEND_URL || '/api'

type MeResponse =
	| { success: true; user: { id: string } }
	| { success: false; message: string }

type TgGroupRow = {
	tg_chat_id: string
	title: string | null
	participants_count: number | null
	updated_at: string
	is_selected?: boolean | null
	send_time?: string | null
	avatar_url?: string | null
}

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

export default function TelegramGroupsPage() {
	const [userId, setUserId] = useState('')
	const [loadingMe, setLoadingMe] = useState(false)
	const [loadingGroups, setLoadingGroups] = useState(false)
	const [syncing, setSyncing] = useState(false)
	const [savingMap, setSavingMap] = useState<Record<string, boolean>>({})
	const [savingTimeMap, setSavingTimeMap] = useState<Record<string, boolean>>(
		{}
	)
	const [groups, setGroups] = useState<TgGroupRow[]>([])
	const [q, setQ] = useState('')
	const [autoSynced, setAutoSynced] = useState(false)
	const router = useRouter()


	const token = Cookies.get('token') || ''

	const fetchMe = async () => {
		setLoadingMe(true)
		try {
			const res = await fetch(`${BACKEND_URL}/auth/me`, {
				headers: { Authorization: `Bearer ${token}` },
				cache: 'no-store',
			})
			const data: MeResponse = await res.json()
			if (!data.success)
				return message.error(data.message || 'Не удалось получить /auth/me')
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
			const res = await fetch(`${BACKEND_URL}/telegram/groups/${uid}`, {
				cache: 'no-store',
			})
			const data = await res.json()
			if (data?.success) setGroups(data.groups || [])
			else message.error('Не удалось загрузить группы Telegram из БД')
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при загрузке TG групп')
		} finally {
			setLoadingGroups(false)
		}
	}

	const syncGroups = async () => {
		if (!userId) return message.warning('Нет userId — перелогиньтесь')
		setSyncing(true)
		try {
			const res = await fetch(`${BACKEND_URL}/telegram/sync-groups`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId }),
			})
			const data = await res.json()
			if (!data.success) {
				if (data.message === 'telegram_not_connected') {
					message.error('Telegram не подключён. Сначала подключите Telegram.')
				} else if (data.message === 'telegram_timeout') {
					message.error('Telegram временно не отвечает. Попробуйте ещё раз через 10–20 секунд.');
					return;
				}{
					message.error(`Ошибка синка TG групп: ${data.message || 'unknown'}`)
				}
				return
			}
			message.success(`TG группы обновлены: ${data.count}`)
			await fetchGroups(userId)
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при /telegram/sync-groups')
		} finally {
			setSyncing(false)
		}
	}

	const setSelected = async (tgChatId: string, next: boolean) => {
		if (!userId) return

		setGroups(prev =>
			prev.map(g =>
				g.tg_chat_id === tgChatId ? { ...g, is_selected: next } : g
			)
		)
		setSavingMap(prev => ({ ...prev, [tgChatId]: true }))

		try {
			const res = await fetch(`${BACKEND_URL}/telegram/groups/select`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userId,
					tg_chat_id: tgChatId,
					is_selected: next,
				}),
			})
			const json = await res.json()
			if (!json?.success) {
				message.error(
					`Не удалось сохранить выбор TG группы: ${json?.message || 'unknown'}`
				)
				setGroups(prev =>
					prev.map(g =>
						g.tg_chat_id === tgChatId ? { ...g, is_selected: !next } : g
					)
				)
			}
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при сохранении выбора TG группы')
			setGroups(prev =>
				prev.map(g =>
					g.tg_chat_id === tgChatId ? { ...g, is_selected: !next } : g
				)
			)
		} finally {
			setSavingMap(prev => ({ ...prev, [tgChatId]: false }))
		}
	}

	const setSendTime = async (tgChatId: string, next: string | null) => {
		if (!userId) return

		setGroups(prev =>
			prev.map(g =>
				g.tg_chat_id === tgChatId ? { ...g, send_time: next } : g
			)
		)
		setSavingTimeMap(prev => ({ ...prev, [tgChatId]: true }))

		try {
			const res = await fetch(`${BACKEND_URL}/telegram/groups/time`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userId,
					tg_chat_id: tgChatId,
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
			setSavingTimeMap(prev => ({ ...prev, [tgChatId]: false }))
		}
	}

	const selectAll = async (val: boolean) => {
		const ids = groups.map(g => g.tg_chat_id)
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
		if (!userId) return
		fetchGroups(userId)
		if (!autoSynced) {
			setAutoSynced(true)
			syncGroups()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [userId])



	const columns: ColumnsType<TgGroupRow> = [
		{
			title: 'Группа',
			key: 'group',
			render: (_: any, row: TgGroupRow) => {
				const checked = row.is_selected !== false
				const busy = !!savingMap[row.tg_chat_id]
				const name = row.title || 'без названия'
				const initial = name.trim().charAt(0).toUpperCase()

				return (
					<div className={styles.rowContent}>
						<div className={styles.rowLeft}>
							<Checkbox
								disabled={busy}
								checked={checked}
								onChange={e => setSelected(row.tg_chat_id, e.target.checked)}
							/>
							<div className={styles.avatar}>
								{row.avatar_url ? (
									<img
										className={styles.avatarImg}
										src={row.avatar_url}
										alt={name}
									/>
								) : (
									<div className={styles.avatarFallback}>{initial}</div>
								)}
							</div>
							<div className={styles.rowTitle}>{name}</div>
						</div>

						<Select
							allowClear
							placeholder='Интервал'
							size='small'
							className={styles.intervalSelect}
							value={row.send_time ?? undefined}
							options={SEND_INTERVAL_OPTIONS}
							disabled={!!savingTimeMap[row.tg_chat_id]}
							onChange={v => setSendTime(row.tg_chat_id, v ?? null)}
						/>
					</div>
				)
			},
		},
	]

	const total = groups.length
	const selected = groups.filter(g => g.is_selected !== false).length

	const filtered = q.trim()
		? groups.filter(g =>
				(g.title || '').toLowerCase().includes(q.trim().toLowerCase())
		  )
		: groups

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
						placeholder='Поиск групп'
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

				{/* Панель действий */}
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
					</Space>
				</div>

				{/* Счётчики */}
				<div className={styles.counters}>
					<div className={styles.counterRow}>
						<b>Всего групп:</b> {groups.length}
					</div>
					<div className={styles.counterRow}>
						<b>Выбрано групп:</b>{' '}
						{groups.filter(g => g.is_selected !== false).length}
					</div>
				</div>

				{/* Контейнер карточек (Table без шапки) */}
				<div className={styles.panel}>
					<div className={styles.table}>
						<Table
							rowKey='tg_chat_id'
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
