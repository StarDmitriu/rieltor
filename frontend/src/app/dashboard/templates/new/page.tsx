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
	Table,
	Tag,
} from 'antd'
import type { UploadProps } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { UploadOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { apiGet, apiPost } from '@/lib/api'

const BACKEND_URL = 'http://localhost:3000'

type GroupRow = {
	wa_group_id: string
	subject: string | null
	participants_count: number | null
	is_announcement: boolean | null
	is_restricted: boolean | null
	updated_at: string
}

export default function TemplateCreatePage() {
	const router = useRouter()
	const [userId, setUserId] = useState('')
	const [saving, setSaving] = useState(false)
	const [uploading, setUploading] = useState(false)
	const [mediaUrl, setMediaUrl] = useState<string | null>(null)
	const [form] = Form.useForm()

	// ✅ groups UI
	const [groups, setGroups] = useState<GroupRow[]>([])
	const [selectedGroupJids, setSelectedGroupJids] = useState<string[]>([])
	const [savingGroups, setSavingGroups] = useState(false)

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

	const loadGroups = async (uid: string) => {
		try {
			const res = await fetch(`${BACKEND_URL}/whatsapp/groups/${uid}`, {
				cache: 'no-store',
			})
			const json = await res.json()
			if (!json?.success) {
				message.error('Не удалось загрузить группы')
				return
			}

			// announcement не даём выбирать (как и в кампании)
			const usable = (json.groups || []).filter((g: any) => !g.is_announcement)
			setGroups(usable)
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при загрузке групп')
		}
	}

	useEffect(() => {
		fetchMe()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	useEffect(() => {
		if (userId) loadGroups(userId)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [userId])

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

	const groupColumns: ColumnsType<GroupRow> = useMemo(
		() => [
			{
				title: 'Название',
				dataIndex: 'subject',
				key: 'subject',
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

	const saveTargetsForTemplate = async (templateId: string) => {
		setSavingGroups(true)
		try {
			const json: any = await apiPost('/templates/targets/set', {
				userId,
				templateId,
				groupJids: selectedGroupJids,
			})
			if (!json?.success) {
				message.error(`Ошибка сохранения групп: ${json?.message || 'unknown'}`)
				return false
			}
			return true
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при сохранении групп')
			return false
		} finally {
			setSavingGroups(false)
		}
	}

	const onFinish = async (values: any) => {
		if (!userId) return message.error('Нет userId')

		setSaving(true)
		try {
			const payload = {
				userId,
				title: values.title,
				text: values.text,
				media_url: mediaUrl,
				enabled: values.enabled ?? true,
				order: values.order ?? 1,
			}

			const json: any = await apiPost('/templates/create', payload)
			if (!json?.success) {
				message.error(`Ошибка создания: ${json?.message || 'unknown'}`)
				return
			}

			const templateId = String(json.templateId || '')
			if (!templateId) {
				message.error('templateId не пришёл')
				return
			}

			// ✅ сразу сохраняем выбранные группы
			const ok = await saveTargetsForTemplate(templateId)
			if (!ok) return

			message.success('Шаблон создан и группы сохранены')
			router.push(`/dashboard/templates/${templateId}`)
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при создании шаблона')
		} finally {
			setSaving(false)
		}
	}

	return (
		<div style={{ padding: 24, maxWidth: 980 }}>
			<h1>Создание шаблона</h1>

			<div style={{ marginBottom: 12, opacity: 0.75 }}>
				userId: <code>{userId || '—'}</code>
			</div>

			<Form
				form={form}
				layout='vertical'
				initialValues={{ enabled: true, order: 1 }}
				onFinish={onFinish}
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
					<Space orientation='vertical' style={{ width: '100%' }}>
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
								</a>{' '}
								<Button
									size='small'
									style={{ marginLeft: 8 }}
									onClick={() => setMediaUrl(null)}
								>
									Убрать
								</Button>
							</div>
						) : (
							<div style={{ fontSize: 13, opacity: 0.7 }}>
								Файл не выбран (можно оставить пустым)
							</div>
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

				{/* ✅ ВЫБОР ГРУПП */}
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

					<div style={{ marginBottom: 10, opacity: 0.75 }}>
						Выбрано групп: <b>{selectedGroupJids.length}</b>
					</div>

					<Space style={{ marginBottom: 10 }} wrap>
						<Button
							onClick={() =>
								setSelectedGroupJids(groups.map(g => g.wa_group_id))
							}
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
					</Space>

					<Table
						rowKey='wa_group_id'
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
						disabled={uploading || savingGroups}
					>
						Сохранить шаблон
					</Button>

					<Button
						onClick={() => router.push('/dashboard/templates')}
						disabled={saving}
					>
						Назад
					</Button>
				</Space>
			</Form>	
		</div>
	)
}
