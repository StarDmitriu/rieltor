//frontend/src/app/dashboard/telegram-groups/page.tsx
'use client'
import { useEffect, useState } from 'react'
import Cookies from 'js-cookie'
import { Button, Table, message, Space, Checkbox } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import styles from './telegram-groups.module.css'
import { Input } from 'antd' 
import { useRouter } from 'next/navigation'


const BACKEND_URL =
	process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'

type MeResponse =
	| { success: true; user: { id: string } }
	| { success: false; message: string }

type TgGroupRow = {
	tg_chat_id: string
	title: string | null
	participants_count: number | null
	updated_at: string
	is_selected?: boolean | null
}

export default function TelegramGroupsPage() {
	const [userId, setUserId] = useState('')
	const [loadingMe, setLoadingMe] = useState(false)
	const [loadingGroups, setLoadingGroups] = useState(false)
	const [syncing, setSyncing] = useState(false)
	const [savingMap, setSavingMap] = useState<Record<string, boolean>>({})
	const [groups, setGroups] = useState<TgGroupRow[]>([])
	const [q, setQ] = useState('')
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
		if (userId) fetchGroups(userId)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [userId])



	const columns: ColumnsType<TgGroupRow> = [
		{
			title: 'Название',
			dataIndex: 'title',
			key: 'title',
			render: (v: string | null) =>
				v || <span style={{ opacity: 0.6 }}>без названия</span>,
		},
		{
			title: 'В рассылку',
			key: 'is_selected',
			width: 110,
			render: (_: any, row: TgGroupRow) => {
				const checked = row.is_selected !== false
				const busy = !!savingMap[row.tg_chat_id]
				return (
					<Checkbox
						disabled={busy}
						checked={checked}
						onChange={e => setSelected(row.tg_chat_id, e.target.checked)}
					/>
				)
			},
		},
		{
			title: 'Chat ID',
			dataIndex: 'tg_chat_id',
			key: 'tg_chat_id',
			render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code>,
		},
		{
			title: 'Участники',
			dataIndex: 'participants_count',
			key: 'participants_count',
			width: 120,
			render: (v: number | null) => (typeof v === 'number' ? v : '—'),
		},
		{
			title: 'Обновлено',
			dataIndex: 'updated_at',
			key: 'updated_at',
			width: 190,
			render: (v: string) => new Date(v).toLocaleString(),
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
