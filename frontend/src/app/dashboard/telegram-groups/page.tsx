//frontend/src/app/dashboard/telegram-groups/page.tsx
'use client'
import { useEffect, useState } from 'react'
import Cookies from 'js-cookie'
import { Button, Table, message, Space, Checkbox } from 'antd'
import type { ColumnsType } from 'antd/es/table'

const BACKEND_URL = 'http://localhost:3000'

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
				} else {
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
			title: 'В рассылку',
			key: 'is_selected',
			width: 110,
			render: (_: any, row: TgGroupRow) => {
				const checked = row.is_selected !== false
				const busy = !!savingMap[row.tg_chat_id]
				return (
					<Checkbox
						checked={checked}
						disabled={busy}
						onChange={e => setSelected(row.tg_chat_id, e.target.checked)}
					/>
				)
			},
		},
		{
			title: 'Название',
			dataIndex: 'title',
			key: 'title',
			render: (v: string | null) =>
				v || <span style={{ opacity: 0.6 }}>без названия</span>,
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

	return (
		<div style={{ padding: 24 }}>
			<h1>Группы Telegram</h1>

			<div style={{ marginBottom: 12 }}>
				<div style={{ opacity: 0.75, marginBottom: 8 }}>
					userId: <code>{userId || '—'}</code>
				</div>

				<Space wrap>
					<Button
						onClick={() => userId && fetchGroups(userId)}
						loading={loadingGroups}
					>
						Обновить таблицу
					</Button>

					<Button
						type='primary'
						onClick={syncGroups}
						loading={syncing}
						disabled={!userId}
					>
						Получить группы
					</Button>

					<Button disabled={!groups.length} onClick={() => selectAll(true)}>
						Выбрать все
					</Button>

					<Button disabled={!groups.length} onClick={() => selectAll(false)}>
						Снять все
					</Button>
				</Space>
			</div>

			<Table
				rowKey='tg_chat_id'
				columns={columns}
				dataSource={groups}
				loading={loadingMe || loadingGroups}
				pagination={{ pageSize: 10 }}
			/>
		</div>
	)
}
