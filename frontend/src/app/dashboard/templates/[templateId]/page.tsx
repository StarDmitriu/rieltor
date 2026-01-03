'use client'

import { useEffect, useMemo, useState } from 'react'
import Cookies from 'js-cookie'
import {
	Button,
	Form,
	Input,
	InputNumber,
	Space,
	Switch,
	message,
	Upload,
	Popconfirm,
	Segmented,
	Table,
	Tag,
} from 'antd'
import type { UploadProps } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { useParams, useRouter } from 'next/navigation'
import { apiGet, apiPost } from '@/lib/api'
import type { ColumnsType } from 'antd/es/table'

const BACKEND_URL = 'http://localhost:3000'

type TemplateRow = {
	id: string
	enabled: boolean
	order: number
	title: string | null
	text: string | null
	media_url: string | null
}

type GroupRow = {
	jid: string // ✅ унифицированный ключ (wa_group_id / tg_chat_id)
	title: string | null
	participants_count: number | null
	is_restricted?: boolean | null
	updated_at: string
}

export default function TemplateEditPage() {
	const router = useRouter()
	const params = useParams()
	const templateId = String((params as any)?.templateId || '')

	const [userId, setUserId] = useState('')
	const [loadingMe, setLoadingMe] = useState(false)
	const [loadingTpl, setLoadingTpl] = useState(false)
	const [saving, setSaving] = useState(false)
	const [uploading, setUploading] = useState(false)

	const [mediaUrl, setMediaUrl] = useState<string | null>(null)
	const [form] = Form.useForm()

	// ✅ targets/groups
	const [channel, setChannel] = useState<'wa' | 'tg'>('wa')
	const [groups, setGroups] = useState<GroupRow[]>([])
	const [selectedGroupJids, setSelectedGroupJids] = useState<string[]>([])
	const [savingGroups, setSavingGroups] = useState(false)

	const token = Cookies.get('token') || ''

	const fetchMe = async () => {
		if (!token) {
			router.push('/auth/phone')
			return
		}
		setLoadingMe(true)
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
		} finally {
			setLoadingMe(false)
		}
	}

	const loadGroups = async (uid: string, ch: 'wa' | 'tg') => {
		const url =
			ch === 'tg'
				? `${BACKEND_URL}/telegram/groups/${uid}`
				: `${BACKEND_URL}/whatsapp/groups/${uid}`

		const res = await fetch(url, { cache: 'no-store' })
		const json = await res.json()
		if (!json?.success) {
			message.error('Не удалось загрузить группы')
			setGroups([])
			return
		}

		if (ch === 'tg') {
			// ✅ ВАЖНО: показываем только TG группы, которые отмечены в telegram-groups (is_selected=true)
			const selectedOnly = (json.groups || []).filter(
				(g: any) => g.is_selected !== false
			)

			setGroups(
				selectedOnly.map((g: any) => ({
					jid: String(g.tg_chat_id),
					title: g.title ?? null,
					participants_count: g.participants_count ?? null,
					is_restricted: false,
					updated_at: g.updated_at,
				}))
			)
		} else {
			// WA: только usable (не announcement) и уже выбранные is_selected=true приходят с бэка
			const usable = (json.groups || []).filter((g: any) => !g.is_announcement)
			setGroups(
				usable.map((g: any) => ({
					jid: String(g.wa_group_id),
					title: g.subject ?? null,
					participants_count: g.participants_count ?? null,
					is_restricted: g.is_restricted ?? false,
					updated_at: g.updated_at,
				}))
			)
		}
	}

	const loadTargets = async (uid: string, ch: 'wa' | 'tg') => {
		const json: any = await apiGet(
			`/templates/targets/${uid}/${templateId}/${ch}`
		)
		if (!json?.success) {
			message.error(`Ошибка загрузки выбранных групп`)
			setSelectedGroupJids([])
			return
		}
		setSelectedGroupJids((json.groupJids || []).map((x: any) => String(x)))
	}

	const saveGroups = async () => {
		if (!userId) return message.error('Нет userId')
		setSavingGroups(true)
		try {
			const json: any = await apiPost('/templates/targets/set', {
				userId,
				templateId,
				groupJids: selectedGroupJids,
				channel, // ✅ сохраняем для текущего канала
			})
			if (!json?.success) {
				message.error(`Ошибка сохранения групп: ${json?.message || 'unknown'}`)
				return
			}
			message.success(
				`Группы сохранены (${channel}): ${
					json.count ?? selectedGroupJids.length
				}`
			)
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при сохранении групп')
		} finally {
			setSavingGroups(false)
		}
	}

	const loadTemplate = async () => {
		if (!templateId) return
		setLoadingTpl(true)
		try {
			const json: any = await apiGet(`/templates/get/${templateId}`)
			if (!json?.success) {
				message.error(`Ошибка загрузки шаблона: ${json?.message || 'unknown'}`)
				return
			}

			const tpl: TemplateRow = json.template
			form.setFieldsValue({
				title: tpl.title || '',
				text: tpl.text || '',
				enabled: tpl.enabled ?? true,
				order: tpl.order ?? 1,
			})
			setMediaUrl(tpl.media_url || null)
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при загрузке шаблона')
		} finally {
			setLoadingTpl(false)
		}
	}

	useEffect(() => {
		fetchMe()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	useEffect(() => {
		if (templateId) loadTemplate()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [templateId])

	// ✅ ключевой фикс: перезагружать groups+targets при смене channel
	useEffect(() => {
		if (!userId || !templateId) return
		loadGroups(userId, channel)
		loadTargets(userId, channel)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [userId, templateId, channel])

	const groupColumns: ColumnsType<GroupRow> = useMemo(
		() => [
			{
				title: 'Название',
				dataIndex: 'title',
				key: 'title',
				render: (v: any) =>
					v || <span style={{ opacity: 0.6 }}>без названия</span>,
			},
			{
				title: 'Участники',
				dataIndex: 'participants_count',
				key: 'participants_count',
				width: 120,
				render: (v: any) => (typeof v === 'number' ? v : '—'),
			},
			{
				title: 'Флаги',
				key: 'flags',
				width: 160,
				render: (_: any, row: any) => (
					<Space>
						{row.is_restricted ? <Tag color='red'>restricted</Tag> : null}
					</Space>
				),
			},
		],
		[]
	)

	const uploadProps: UploadProps = useMemo(
		() => ({
			maxCount: 1,
			beforeUpload: async file => {
				if (!userId) {
					message.error('Нет userId')
					return Upload.LIST_IGNORE
				}

				setUploading(true)
				try {
					const fd = new FormData()
					fd.append('userId', userId)
					fd.append('file', file)

					const res = await fetch(`${BACKEND_URL}/templates/upload-media`, {
						method: 'POST',
						headers: {
							...(token ? { Authorization: `Bearer ${token}` } : {}),
						},
						body: fd,
					})

					const json = await res.json()
					if (!json?.success) {
						message.error(
							`Ошибка загрузки файла: ${json?.message || 'unknown'}`
						)
						return Upload.LIST_IGNORE
					}

					const url = String(json.publicUrl || json.url || '')
					if (!url) {
						message.error('Не пришла ссылка на файл от сервера')
						return Upload.LIST_IGNORE
					}

					setMediaUrl(url)
					message.success('Файл загружен')
				} catch (e) {
					console.error(e)
					message.error('Ошибка сети при загрузке файла')
				} finally {
					setUploading(false)
				}

				return Upload.LIST_IGNORE
			},
		}),
		[userId, token]
	)

	const onSave = async (values: any) => {
		if (!userId) return message.error('Нет userId')
		if (!templateId) return message.error('Нет templateId')

		setSaving(true)
		try {
			const payload = {
				userId,
				templateId,
				title: values.title,
				text: values.text,
				media_url: mediaUrl,
				enabled: values.enabled ?? true,
				order: values.order ?? 1,
			}

			const json: any = await apiPost('/templates/update', payload)
			if (!json?.success) {
				message.error(`Ошибка сохранения: ${json?.message || 'unknown'}`)
				return
			}

			message.success('Шаблон сохранён')
			router.push('/dashboard/templates')
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при сохранении')
		} finally {
			setSaving(false)
		}
	}

	const onDelete = async () => {
		if (!userId) return message.error('Нет userId')
		if (!templateId) return message.error('Нет templateId')

		setSaving(true)
		try {
			const json: any = await apiPost('/templates/delete', {
				userId,
				templateId,
			})
			if (!json?.success) {
				message.error(`Ошибка удаления: ${json?.message || 'unknown'}`)
				return
			}
			message.success('Шаблон удалён')
			router.push('/dashboard/templates')
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при удалении')
		} finally {
			setSaving(false)
		}
	}

	return (
		<div style={{ padding: 24, maxWidth: 820 }}>
			<h1>Редактирование шаблона</h1>

			<div style={{ marginBottom: 12, opacity: 0.75 }}>
				userId: <code>{userId || '—'}</code> | templateId:{' '}
				<code>{templateId || '—'}</code>
			</div>

			<Form
				form={form}
				layout='vertical'
				initialValues={{ enabled: true, order: 1 }}
				onFinish={onSave}
			>
				<Form.Item label='Название шаблона' name='title'>
					<Input placeholder='Например: Акция / Подбор объектов / Описание квартиры' />
				</Form.Item>

				<Form.Item
					label='Текст сообщения'
					name='text'
					rules={[
						{
							validator: async (_, value) => {
								const title = form.getFieldValue('title')
								if (
									!String(title || '').trim() &&
									!String(value || '').trim()
								) {
									return Promise.reject(
										new Error('Нужно заполнить title или text')
									)
								}
								return Promise.resolve()
							},
						},
					]}
				>
					<Input.TextArea rows={6} placeholder='Введите текст сообщения' />
				</Form.Item>

				<Form.Item label='Медиа (картинка/видео)'>
					<Space direction='vertical' style={{ width: '100%' }}>
						<Upload {...uploadProps}>
							<Button
								icon={<UploadOutlined />}
								loading={uploading}
								disabled={!userId}
							>
								Выбрать файл
							</Button>
						</Upload>

						{mediaUrl ? (
							<div style={{ fontSize: 13 }}>
								Текущая ссылка:{' '}
								<a href={mediaUrl} target='_blank' rel='noreferrer'>
									открыть
								</a>
								<Button
									size='small'
									style={{ marginLeft: 8 }}
									onClick={() => setMediaUrl(null)}
									disabled={uploading || saving}
								>
									Убрать
								</Button>
							</div>
						) : (
							<div style={{ fontSize: 13, opacity: 0.7 }}>Файл не выбран</div>
						)}
					</Space>
				</Form.Item>

				<Space wrap>
					<Form.Item label='Включен' name='enabled' valuePropName='checked'>
						<Switch />
					</Form.Item>

					<Form.Item label='Order' name='order'>
						<InputNumber min={1} />
					</Form.Item>
				</Space>

				<div
					style={{
						marginTop: 18,
						padding: 12,
						border: '1px solid #eee',
						borderRadius: 12,
					}}
				>
					<div style={{ fontWeight: 700, marginBottom: 8 }}>
						Куда отправлять этот шаблон
					</div>

					<div style={{ marginBottom: 10 }}>
						<Segmented
							value={channel}
							onChange={v => setChannel(v as any)}
							options={[
								{ label: 'WhatsApp', value: 'wa' },
								{ label: 'Telegram', value: 'tg' },
							]}
						/>
					</div>

					<div style={{ marginBottom: 10, opacity: 0.75 }}>
						Канал: <b>{channel.toUpperCase()}</b> | Выбрано групп:{' '}
						<b>{selectedGroupJids.length}</b> | Доступно групп:{' '}
						<b>{groups.length}</b>
					</div>

					<Space style={{ marginBottom: 10 }} wrap>
						<Button
							onClick={() => setSelectedGroupJids(groups.map(g => g.jid))}
							disabled={!groups.length}
						>
							Выбрать все
						</Button>

						<Button
							onClick={() => setSelectedGroupJids([])}
							disabled={!selectedGroupJids.length}
						>
							Снять все
						</Button>

						<Button type='primary' onClick={saveGroups} loading={savingGroups}>
							Сохранить группы ({channel.toUpperCase()})
						</Button>
					</Space>

					<Table
						rowKey='jid'
						columns={groupColumns}
						dataSource={groups}
						pagination={{ pageSize: 8 }}
						rowSelection={{
							selectedRowKeys: selectedGroupJids,
							onChange: keys => setSelectedGroupJids(keys as string[]),
						}}
					/>
				</div>

				<Space style={{ marginTop: 12 }}>
					<Button
						type='primary'
						htmlType='submit'
						loading={saving}
						disabled={uploading || loadingMe || loadingTpl}
					>
						Сохранить
					</Button>

					<Button
						onClick={() => router.push('/dashboard/templates')}
						disabled={saving}
					>
						Назад
					</Button>

					<Popconfirm
						title='Удалить шаблон?'
						okText='Удалить'
						cancelText='Отмена'
						onConfirm={onDelete}
					>
						<Button danger disabled={saving || uploading}>
							Удалить
						</Button>
					</Popconfirm>
				</Space>

				{loadingTpl ? (
					<div style={{ marginTop: 10, opacity: 0.75 }}>Загрузка…</div>
				) : null}
			</Form>
		</div>
	)
}
