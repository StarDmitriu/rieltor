'use client'
//frontend/src/app/dashboard/groups/page.tsx
import { useEffect, useState } from 'react'
import Cookies from 'js-cookie'
import { Button, Table, message, Space, Tag, Checkbox } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRouter } from 'next/navigation'

const BACKEND_URL = 'http://localhost:3000'

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
}

type GroupsResponse =
	| {
			success: true
			groups: GroupRow[]
	  }
	| { success: false; message: string }

export default function GroupsPage() {
	const [userId, setUserId] = useState<string>('')
	const [loadingMe, setLoadingMe] = useState(false)
	const [loadingGroups, setLoadingGroups] = useState(false)
	const [syncing, setSyncing] = useState(false)
	const [savingMap, setSavingMap] = useState<Record<string, boolean>>({})
	const [groups, setGroups] = useState<GroupRow[]>([])
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

	const dash = () => {
		router.push('/dashboard/telegram-groups')
	}

	const fetchGroups = async (uid: string) => {
		if (!uid) return
		setLoadingGroups(true)
		try {
			const res = await fetch(`${BACKEND_URL}/whatsapp/groups/${uid}`, {
				cache: 'no-store',
			})
			const data: GroupsResponse = await res.json()
			if ((data as any).success) {
				setGroups((data as any).groups || [])
			} else {
				message.error('Не удалось загрузить группы из БД')
			}
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при загрузке групп')
		} finally {
			setLoadingGroups(false)
		}
	}

	const syncGroups = async () => {
		if (!userId) {
			message.warning('Нет userId — перелогиньтесь')
			return
		}
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

		// optimistic UI
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
				// rollback
				setGroups(prev =>
					prev.map(g =>
						g.wa_group_id === waGroupId ? { ...g, is_selected: !next } : g
					)
				)
			}
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при сохранении выбора группы')
			// rollback
			setGroups(prev =>
				prev.map(g =>
					g.wa_group_id === waGroupId ? { ...g, is_selected: !next } : g
				)
			)
		} finally {
			setSavingMap(prev => ({ ...prev, [waGroupId]: false }))
		}
	}

	const selectAll = async (val: boolean) => {
		// быстрое массовое действие на UI
		const ids = groups.map(g => g.wa_group_id)
		setGroups(prev => prev.map(g => ({ ...g, is_selected: val })))

		// последовательно сохраняем на бэке (простое и надёжное)
		for (const id of ids) {
			// eslint-disable-next-line no-await-in-loop
			await setSelected(id, val)
		}
	}

	useEffect(() => {
		if (!token) {
			message.warning('Нет токена. Войдите в аккаунт.')
			return
		}
		fetchMe()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [token])

	useEffect(() => {
		if (userId) fetchGroups(userId)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [userId])

	const columns: ColumnsType<GroupRow> = [
		{
			title: 'В рассылку',
			key: 'is_selected',
			width: 110,
			render: (_: any, row: GroupRow) => {
				const checked = row.is_selected !== false // null/undefined => считаем true
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
			title: 'Название',
			dataIndex: 'subject',
			key: 'subject',
			render: (v: string | null) =>
				v || <span style={{ opacity: 0.6 }}>без названия</span>,
		},
		{
			title: 'Group ID',
			dataIndex: 'wa_group_id',
			key: 'wa_group_id',
			render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code>,
		},
		{
			title: 'Участники',
			dataIndex: 'participants_count',
			key: 'participants_count',
			width: 110,
			render: (v: number | null) => (typeof v === 'number' ? v : '—'),
		},
		{
			title: 'Тип',
			key: 'flags',
			width: 220,
			render: (_: any, row: GroupRow) => (
				<Space>
					{row.is_announcement ? <Tag color='gold'>announce</Tag> : null}
					{row.is_restricted ? <Tag color='red'>restricted</Tag> : null}
				</Space>
			),
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
			<h1>Группы WhatsApp</h1>

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
					Telegram группы
					</button>
				</Space>
			</div>

			<Table
				rowKey='wa_group_id'
				columns={columns}
				dataSource={groups}
				loading={loadingMe || loadingGroups}
				pagination={{ pageSize: 10 }}
			/>
		</div>
	)
}
