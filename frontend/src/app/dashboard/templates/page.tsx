'use client'
//frontend/src/app/dashboard/templates/page.tsx
import { useEffect, useState } from 'react'
import Cookies from 'js-cookie'
import { Button, Space, Table, Tag, message, Popconfirm } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRouter } from 'next/navigation'
import { apiGet, apiPost } from '@/lib/api'



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

const BACKEND_URL =
	process.env.NEXT_PUBLIC_BACKEND_URL || '/api'

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

	const columns: ColumnsType<TemplateRow> = [
		{
			title: 'Вкл',
			dataIndex: 'enabled',
			key: 'enabled',
			width: 70,
			render: v => (v ? <Tag color='green'>ON</Tag> : <Tag>OFF</Tag>),
		},
		{ title: 'Order', dataIndex: 'order', key: 'order', width: 80 },
		{
			title: 'Title',
			dataIndex: 'title',
			key: 'title',
			render: v => v || <span style={{ opacity: 0.6 }}>—</span>,
		},
		{
			title: 'Text',
			dataIndex: 'text',
			key: 'text',
			render: v =>
				v ? (
					<span>
						{String(v).slice(0, 120)}
						{String(v).length > 120 ? '…' : ''}
					</span>
				) : (
					<span style={{ opacity: 0.6 }}>—</span>
				),
		},
		{
			title: 'Media',
			dataIndex: 'media_url',
			key: 'media_url',
			render: v =>
				v ? (
					<a href={v} target='_blank' rel='noreferrer'>
						открыть
					</a>
				) : (
					<span style={{ opacity: 0.6 }}>—</span>
				),
		},
		{
			title: 'Updated',
			dataIndex: 'updated_at',
			key: 'updated_at',
			width: 190,
			render: v => (v ? new Date(v).toLocaleString() : '—'),
		},
		{
			title: 'Действия',
			key: 'actions',
			width: 220,
			render: (_: any, row: TemplateRow) => (
				<Space>
					<Button
						size='small'
						onClick={() => router.push(`/dashboard/templates/${row.id}`)}
					>
						Редактировать
					</Button>

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
								message.error(`Ошибка удаления: ${res?.message || 'unknown'}`)
								return
							}
							message.success('Шаблон удалён')
							load()
						}}
					>
						<Button size='small' danger>
							Удалить
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	]

	return (
		<div style={{ padding: 24 }}>
			<h1>Шаблоны</h1>

			<div style={{ marginBottom: 12, opacity: 0.75 }}>
				userId: <code>{userId || '—'}</code>
			</div>

			<Space wrap style={{ marginBottom: 12 }}>
				<Button
					type='primary'
					onClick={() => router.push('/dashboard/templates/new')}
				>
					Создать шаблон
				</Button>

				<Button onClick={() => load()} loading={loading}>
					Обновить
				</Button>

				<Button onClick={() => router.push('/cabinet')}>Назад</Button>
			</Space>

			<Table
				rowKey='id'
				columns={columns}
				dataSource={rows}
				loading={loading}
				pagination={{ pageSize: 10 }}
			/>
		</div>
	)
}
